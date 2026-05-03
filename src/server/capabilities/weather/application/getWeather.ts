import {
  type GetWeatherInput,
  type WeatherClient,
  type WeatherResult
} from "@/server/capabilities/weather/domain/weather";
import { getCurrentWeatherFromOpenMeteo } from "@/server/capabilities/weather/infrastructure/openMeteoWeatherClient";

type GetWeatherDependencies = {
  weatherClient: WeatherClient;
};

const defaultDependencies: GetWeatherDependencies = {
  weatherClient: getCurrentWeatherFromOpenMeteo
};

export async function getWeather(
  input: GetWeatherInput,
  dependencies: GetWeatherDependencies = defaultDependencies
): Promise<WeatherResult> {
  return dependencies.weatherClient(input);
}
