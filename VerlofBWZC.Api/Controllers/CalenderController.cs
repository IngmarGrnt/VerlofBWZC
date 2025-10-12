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

        // DTO voor de request body
        public class AddDayOffRequest
        {
            public int PersonId { get; set; }
            public DateTime Date { get; set; }
            public string? Description { get; set; }
            public DayOffstatus? Status { get; set; }
        }

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

        [HttpPost("add-dayoff")]
        public async Task<IActionResult> AddMultipleDayOffs([FromBody] AddMultipleDayOffsRequest request)
        {

            // Controleer of de persoon bestaat
            var person = await _context.Persons.FindAsync(request.PersoonId);
            if (person == null)
            {
                return NotFound($"Persoon met id {request.PersoonId} niet gevonden.");
            }

            // Haal alle bestaande DayOffs voor deze persoon op
            var existingDayOffs = await _context.DayOffs
                .Where(d => d.PersonId == request.PersoonId)
                .ToListAsync();

            // Bepaal de datums die in de request zitten
            var requestedDates = request.Days.Select(d => d.Date.Date).ToHashSet();

            
            // Alleen verwijderen als het jaar toegestaan is
            var currentYear = DateTime.Now.Year;
            var allowedYears = new[] {currentYear + 1 };
            var toRemove = existingDayOffs
                .Where(d => !requestedDates.Contains(d.Date.Date) && allowedYears.Contains(d.Date.Year))
                .ToList();
            if (toRemove.Any())
            {
                _context.DayOffs.RemoveRange(toRemove);
            }


            var addedDates = new List<DateTime>();
            var skippedDates = new List<DateTime>();

            // Voeg nieuwe DayOffs toe die nog niet bestaan
            foreach (var day in request.Days)
            {
                bool alreadyExists = existingDayOffs.Any(d => d.Date.Date == day.Date.Date);
                if (alreadyExists)
                {
                    skippedDates.Add(day.Date);
                    continue;
                }

                var dayOff = new DayOff
                {
                    PersonId = request.PersoonId,
                    Date = day.Date,
                    Description = "", // Vul aan indien nodig
                    Status = DayOffstatus.Approved // Of een andere default status
                };

                _context.DayOffs.Add(dayOff);
                addedDates.Add(day.Date);
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Added = addedDates,
                Skipped = skippedDates,
                Removed = toRemove.Select(d => d.Date)
            });
        }

        [HttpGet("person-days-off/{personId}")]
        public async Task<IActionResult> GetDaysOffForPerson(int personId)
        {
            var person = await _context.Persons.FindAsync(personId);
            if (person == null)
            {
                return NotFound($"Persoon met id {personId} niet gevonden.");
            }

            var daysOff = await _context.DayOffs
                .Where(d => d.PersonId == personId)
                .Select(d => new
                {
                    d.Date,
                    d.Description,
                    d.Status
                })
                .ToListAsync();

            return Ok(daysOff);
        }

        public class WorkDay
        {
            public DateTime Date { get; set; }
        }
        // DTO voor de request body
        public class AddMultipleDayOffsRequest
        {
            public int PersoonId { get; set; }
            public List<WorkDay> Days { get; set; } = new();
        }
    }
}
