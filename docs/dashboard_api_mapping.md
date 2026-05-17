# Weather Dashboard API Mapping

Verified on 2026-05-17.

This note maps the current Weather Starter dashboard cards to the relevant data.gov.sg weather APIs.

Related notes: [Exercise Notes](./exercise_notes.md)

## Summary

The backend already composes most of the weather data into a single `WeatherSnapshot`, and the frontend cards read from that snapshot rather than calling data.gov.sg directly.

Current app code references:

- [backend/src/weather.ts](/Users/fredchan/CodeForFun/weather_starter/backend/src/weather.ts)
- [frontend/src/components/Hero.tsx](/Users/fredchan/CodeForFun/weather_starter/frontend/src/components/Hero.tsx)
- [frontend/src/components/HourlyStrip.tsx](/Users/fredchan/CodeForFun/weather_starter/frontend/src/components/HourlyStrip.tsx)
- [frontend/src/components/TenDayForecast.tsx](/Users/fredchan/CodeForFun/weather_starter/frontend/src/components/TenDayForecast.tsx)
- [frontend/src/components/Tiles.tsx](/Users/fredchan/CodeForFun/weather_starter/frontend/src/components/Tiles.tsx)

## Card To API Map

| Card / UI Surface | data.gov.sg endpoint(s) | What it fills |
| --- | --- | --- |
| Location summary card and hero header | `GET /v2/real-time/api/two-hr-forecast`, `GET /v2/real-time/api/air-temperature`, `GET /v2/real-time/api/twenty-four-hr-forecast` | Area name, current condition, current temperature, observed time, and today’s high/low |
| 24-hour forecast strip (`HourlyStrip`) | `GET /v2/real-time/api/twenty-four-hr-forecast` | Regional forecast periods and the matching forecast text for the selected location |
| 4-day forecast card (`TenDayForecast`) | `GET /v1/environment/4-day-weather-forecast` | Daily forecast text plus low/high temperature ranges |
| Air quality tile | `GET /v2/real-time/api/psi`, `GET /v2/real-time/api/pm25` | PSI, PM2.5, and the nearest air-quality region |
| Wind tile | `GET /v2/real-time/api/wind-speed`, `GET /v2/real-time/api/wind-direction` | Wind speed and direction |
| UV tile | `GET /v2/real-time/api/uv` | Current UVI and severity label |
| Temperature tile | `GET /v2/real-time/api/air-temperature` | Current nearest-station temperature |
| Rainfall tile | `GET /v2/real-time/api/rainfall` | Current nearest-station rainfall |
| Humidity tile | `GET /v2/real-time/api/relative-humidity` | Current nearest-station humidity |
| Forecast high tile | `GET /v2/real-time/api/twenty-four-hr-forecast` | Today’s high from the 24-hour forecast |

## Notes

- `HourlyStrip` is named like an hourly UI, but it is fed by the 24-hour regional forecast.
- `TenDayForecast` is also a legacy name; the data source is the 4-day forecast API.
- The 2-hour forecast API is used to determine the location’s area and current weather condition.
- If we add a map card later, the app should use saved locations from the database and optionally the 2-hour forecast `area_metadata` for labels. There is no separate map-specific weather endpoint.

## Official Sources

- [2-hour Weather Forecast](https://data.gov.sg/datasets/d_3f9e064e25005b0e42969944ccaf2e7a/view)
- [24-hour Weather Forecast](https://data.gov.sg/datasets/d_ce2eb1e307bda31993c533285834ef2b/view)
- [4-day Weather Forecast](https://data.gov.sg/datasets/d_1efe4728b2dad26fd7729c5e4eff7802/view)
- [Realtime Weather Readings across Singapore](https://data.gov.sg/collections/1459/view)
- [Pollutant Standards Index (PSI)](https://data.gov.sg/datasets/d_fe37906a0182569d891506e815e819b7/view)
- [Ultraviolet Index (UVI)](https://data.gov.sg/dataset/ultraviolet-index-uvi)
