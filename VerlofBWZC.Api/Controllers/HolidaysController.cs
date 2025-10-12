using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Net.Http.Json;

[ApiController]
[Route("api/[controller]")]
public class HolidaysController : ControllerBase
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

    [HttpGet("school/{year}")]
    public async Task<IActionResult> GetSchoolHolidays(int year)
    {
        var url = $"https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&subdivisionCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";
        var result = await _httpClient.GetStringAsync(url);
        return Content(result, "application/json");
    }
}