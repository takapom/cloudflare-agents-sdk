import {
  type GetWeatherInput,
  type WeatherResult,
  weatherCodeLabel
} from "@/server/capabilities/weather/domain/weather";

type GeocodingResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
};

export async function getCurrentWeatherFromOpenMeteo(
  input: GetWeatherInput
): Promise<WeatherResult> {
  const city = input.city.trim();
  const timezone = input.timezone || "Asia/Tokyo";
  const countryCode = input.countryCode?.toUpperCase();

  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", city);
  geocodeUrl.searchParams.set("count", "5");
  geocodeUrl.searchParams.set("language", "ja");
  geocodeUrl.searchParams.set("format", "json");

  const geocodeResponse = await fetch(geocodeUrl);
  if (!geocodeResponse.ok) {
    return {
      ok: false,
      source: "open-meteo",
      error: `Geocoding failed with status ${geocodeResponse.status}`
    };
  }

  const geocodeData = (await geocodeResponse.json()) as {
    results?: GeocodingResult[];
  };
  const location = geocodeData.results?.find((result) =>
    countryCode ? result.country_code === countryCode : true
  );

  if (!location) {
    return {
      ok: false,
      source: "open-meteo",
      error: `Location not found: ${city}`,
      city,
      countryCode: countryCode ?? null
    };
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(location.latitude));
  forecastUrl.searchParams.set("longitude", String(location.longitude));
  forecastUrl.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "wind_speed_10m"
    ].join(",")
  );
  forecastUrl.searchParams.set("timezone", timezone);

  const forecastResponse = await fetch(forecastUrl);
  if (!forecastResponse.ok) {
    return {
      ok: false,
      source: "open-meteo",
      error: `Forecast failed with status ${forecastResponse.status}`
    };
  }

  const forecastData = (await forecastResponse.json()) as {
    current?: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      precipitation: number;
      weather_code: number;
      wind_speed_10m: number;
    };
    current_units?: Record<string, string>;
  };
  const current = forecastData.current;

  if (!current) {
    return {
      ok: false,
      source: "open-meteo",
      error: "Forecast response did not include current weather."
    };
  }

  return {
    ok: true,
    source: "open-meteo",
    location: {
      name: location.name,
      country: location.country ?? null,
      countryCode: location.country_code ?? null,
      admin1: location.admin1 ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone ?? timezone
    },
    current: {
      time: current.time,
      condition: weatherCodeLabel(current.weather_code),
      weatherCode: current.weather_code,
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      precipitation: current.precipitation,
      windSpeed: current.wind_speed_10m,
      units: forecastData.current_units ?? {}
    }
  };
}
