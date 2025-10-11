using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CalenderController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _context;
        private readonly CalendarHelper _calendarService;

        public CalenderController(VerlofBWZC_DbContext context, CalendarHelper calendarService)
        {
            _context = context;
            _calendarService = calendarService;
        }

        [HttpGet]
        public IActionResult GetCalendar(TeamName teamName, int year)
        {
            // Maak een Team-object aan op basis van de enum
            var team = new Team { Name = teamName };
            var calendar = _calendarService.GenerateWorkCalendar(team, year);
            return Ok(calendar);
        }
    }
}
