

using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Net.Http.Json;
using VerlofBWZC.DataContracts.DTO.Holiday;

namespace VerlofBWZC.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HolidaysController : Controller
    {
        private readonly HttpClient _httpClient;
        public HolidaysController(IHttpClientFactory httpClientFactory)
        {
            _httpClient = httpClientFactory.CreateClient();
        }

        [HttpGet("public/{year}")]
        public async Task<IActionResult> GetPublicHolidays(int year)
        {
            var url = $"https://openholidaysapi.org/PublicHolidays?countryIsoCode=BE&subdivisionCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";
            var result = await _httpClient.GetStringAsync(url);
            return Content(result, "application/json");
        }

        //[HttpGet("school/{year}")]
        //public async Task<IActionResult> GetSchoolHolidays(int year)
        //{
        //    var url = $"https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&subdivisionCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";
        //    var result = await _httpClient.GetStringAsync(url);
        //    return Content(result, "application/json");
        //}



        [HttpGet("school/{year}")]
        public async Task<IActionResult> GetSchoolHolidays(int year)
        {
            var url = $"https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&subdivisionCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";
            var result = await _httpClient.GetStringAsync(url);

            var allHolidays = System.Text.Json.JsonSerializer.Deserialize<List<SchoolHolidayDTO>>(result, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new();

            var holidays = allHolidays
                .Where(h => h.Subdivisions != null && h.Subdivisions.Any(s => s.ShortName == "NL"))
                .ToList();

            // Corrigeer Kerstvakantie en Zomervakantie einddatums
            foreach (var holiday in holidays)
            {
                var name = holiday.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
                    ?? holiday.Name?.FirstOrDefault()?.Text
                    ?? "";

                // Kerstvakantie maximaal tot 3 januari volgend jaar
                if (name.Contains("Kerstvakantie", StringComparison.OrdinalIgnoreCase))
                {
                    var maxAllowed = new DateTime(year + 1, 1, 3);
                    if (holiday.EndDate > maxAllowed)
                        holiday.EndDate = maxAllowed;
                }

                // Zomervakantie maximaal tot 31 augustus van het jaar
                if (name.Contains("Zomervakantie", StringComparison.OrdinalIgnoreCase))
                {
                    var maxAllowed = new DateTime(year, 8, 31);
                    if (holiday.EndDate > maxAllowed)
                        holiday.EndDate = maxAllowed;
                }
            }

            // Filter "Begin van de zomervakantie" als er een overlappende "Zomervakantie" is
            holidays = holidays.Where(h =>
            {
                var name = h.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
                    ?? h.Name?.FirstOrDefault()?.Text
                    ?? "";

                if (name.StartsWith("Begin van de zomervakantie", StringComparison.OrdinalIgnoreCase))
                {
                    // Zoek overlappende "Zomervakantie"
                    return !holidays.Any(z =>
                        (z.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
                            ?? z.Name?.FirstOrDefault()?.Text
                            ?? "") == "Zomervakantie"
                        && z.StartDate <= h.EndDate
                        && z.EndDate >= h.StartDate
                    );
                }
                return true;
            }).ToList();

            return Ok(holidays);
        }





    }
}