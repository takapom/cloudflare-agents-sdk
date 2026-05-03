import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { GetWeatherInput } from "@/server/capabilities/weather/domain/weather";

export type WeatherToolHandlers = {
  getWeather: (input: GetWeatherInput) => Promise<unknown>;
};

export function createWeatherTools(handlers: WeatherToolHandlers): ToolSet {
  return {
    getWeather: tool({
      description:
        "Get current weather for a city through the approved weather capability. Use this instead of writing network fetch code in codemode.",
      inputSchema: z.object({
        city: z.string().min(1).describe("City name such as Osaka, Tokyo, or 大阪"),
        countryCode: z
          .string()
          .length(2)
          .optional()
          .describe("Optional ISO 3166-1 alpha-2 country code such as JP"),
        timezone: z
          .string()
          .default("Asia/Tokyo")
          .describe("IANA timezone for returned timestamps")
      }),
      execute: async ({ city, countryCode, timezone }) => {
        return handlers.getWeather({ city, countryCode, timezone });
      }
    })
  };
}
