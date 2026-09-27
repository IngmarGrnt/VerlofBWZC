using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts.DTO.Lottery;

namespace VerlofBWZC.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin,Manager")]
    public class LotteryController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _db;
        private readonly ILogger<LotteryController> _logger;
        private readonly UserContext _me;
        private readonly CalendarAccessService _access;

        public LotteryController(VerlofBWZC_DbContext db, ILogger<LotteryController> logger, UserContext me, CalendarAccessService access)
        {
            _db = db;
            _logger = logger;
            _me = me;
            _access = access;
        }

        // Personen waarover de gebruiker lotingen mag zien/beheren: null = alle (Admin), anders eigen ploeg + specialiteit
        private async Task<HashSet<int>?> AllowedPersonIdsAsync()
        {
            if (_me.IsAdmin)
                return null;

            var keys = await _me.GetScopeKeysAsync();
            var ids = await _db.Persons
                .Where(p => p.Team != null && p.Speciality != null
                    && keys.Contains((int)p.Team.Value * 100 + (int)p.Speciality.Value))
                .Select(p => p.Id)
                .ToListAsync();
            return ids.ToHashSet();
        }

        private static bool AllAllowed(IEnumerable<int> personIds, HashSet<int>? allowed) =>
            allowed == null || (personIds.Any() && personIds.All(allowed.Contains));

        // GET: api/lottery/draws
        [HttpGet("draws")]
        public async Task<ActionResult<IEnumerable<LotteryDrawDTO>>> GetDraws()
        {
            var allowed = await AllowedPersonIdsAsync();
            var draws = (await _db.LotteryDraws
                .Include(d => d.Winners)
                .Include(d => d.Losers)
                .OrderBy(d => d.DrawNumber)
                .ThenBy(d => d.CreatedAtUtc)
                .ToListAsync())
                .Where(d => AllAllowed(d.Winners.Select(w => w.PersonId).Concat(d.Losers.Select(l => l.PersonId)), allowed));

            var result = draws.Select(d => new LotteryDrawDTO
            {
                DrawNumber = d.DrawNumber,
                DrawName = d.DrawName,
                FromDate = d.FromDate,
                ToDate = d.ToDate,
                CreatedAtUtc = d.CreatedAtUtc,
                Winners = d.Winners.Select(w => new LotteryPersonDTO
                {
                    PersonId = w.PersonId,
                    FirstName = w.FirstName,
                    LastName = w.LastName
                }).ToList(),
                Losers = d.Losers.Select(l => new LotteryPersonDTO
                {
                    PersonId = l.PersonId,
                    FirstName = l.FirstName,
                    LastName = l.LastName,
                    RemovedDay = l.RemovedDay,
                    RemovedNight = l.RemovedNight,
                    DayLeaveCategoryId = l.DayLeaveCategoryId,
                    NightLeaveCategoryId = l.NightLeaveCategoryId
                }).ToList()
            }).ToList();

            return Ok(result);
        }

        // POST: api/lottery/draw
        [HttpPost("draw")]
        public async Task<IActionResult> CreateDraw([FromBody] LotteryDrawDTO dto)
        {
            if (dto == null)
                return BadRequest("Body is leeg.");

            var participants = (dto.Winners ?? new()).Select(w => w.PersonId).Concat((dto.Losers ?? new()).Select(l => l.PersonId));
            if (!AllAllowed(participants, await AllowedPersonIdsAsync()))
                return Forbid();

            // Volgnummer uniek houden (managers zien enkel de lotingen van hun eigen ploeg)
            var drawNumber = dto.DrawNumber;
            if (await _db.LotteryDraws.AnyAsync(d => d.DrawNumber == drawNumber))
                drawNumber = (await _db.LotteryDraws.MaxAsync(d => (int?)d.DrawNumber) ?? 0) + 1;

            try
            {
                var entity = new LotteryDraw
                {
                    DrawNumber = drawNumber,
                    DrawName = dto.DrawName ?? string.Empty,
                    FromDate = dto.FromDate,
                    ToDate = dto.ToDate,
                    CreatedAtUtc = DateTime.UtcNow,
                    Winners = (dto.Winners ?? new List<LotteryPersonDTO>()).Select(w => new LotteryWinner
                    {
                        PersonId = w.PersonId,
                        FirstName = w.FirstName ?? string.Empty,
                        LastName = w.LastName ?? string.Empty
                    }).ToList(),
                    Losers = (dto.Losers ?? new List<LotteryPersonDTO>()).Select(l => new LotteryLoser
                    {
                        PersonId = l.PersonId,
                        FirstName = l.FirstName ?? string.Empty,
                        LastName = l.LastName ?? string.Empty
                    }).ToList()
                };

                _db.LotteryDraws.Add(entity);
                await _db.SaveChangesAsync();

                // Het (eventueel aangepaste) volgnummer teruggeven, zodat de loting nadien toegepast kan worden
                return Ok(drawNumber);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fout bij bewaren loting");
                return StatusCode(500, "Er is iets misgelopen bij het bewaren van de loting.");
            }
        }

        [HttpDelete("draw/{drawNumber}")]
        public async Task<IActionResult> DeleteDraw(int drawNumber)
        {
            var draw = await _db.LotteryDraws
                .Include(d => d.Winners)
                .Include(d => d.Losers)
                .FirstOrDefaultAsync(d => d.DrawNumber == drawNumber);

            if (draw == null)
                return NotFound();

            var participants = draw.Winners.Select(w => w.PersonId).Concat(draw.Losers.Select(l => l.PersonId));
            if (!AllAllowed(participants, await AllowedPersonIdsAsync()))
                return Forbid();

            // Toegepaste loting: het weggehaalde verlof van de verliezers terugzetten (met hun verlofregel)
            var restored = new List<RestoredDayOffDTO>();
            foreach (var loser in draw.Losers)
            {
                if (loser.RemovedDay)
                    restored.Add(new RestoredDayOffDTO { PersonId = loser.PersonId, Date = draw.FromDate.Date, Shift = "D", LeaveCategoryId = loser.DayLeaveCategoryId });
                if (loser.RemovedNight)
                    restored.Add(new RestoredDayOffDTO { PersonId = loser.PersonId, Date = draw.ToDate.Date, Shift = "N", LeaveCategoryId = loser.NightLeaveCategoryId });
            }

            var personIds = restored.Select(r => r.PersonId).Distinct().ToList();
            var dates = restored.Select(r => r.Date).Distinct().ToList();
            var existing = await _db.DayOffs
                .Where(d => personIds.Contains(d.PersonId) && dates.Contains(d.Date.Date))
                .ToListAsync();
            var categoryIds = restored.Where(r => r.LeaveCategoryId != null).Select(r => r.LeaveCategoryId!.Value).Distinct().ToList();
            var validCategoryIds = (await _db.LeaveCategories
                .Where(c => categoryIds.Contains(c.Id))
                .Select(c => c.Id)
                .ToListAsync()).ToHashSet();

            foreach (var r in restored.ToList())
            {
                // Intussen opnieuw aangeduid: niet dubbel toevoegen
                if (existing.Any(d => d.PersonId == r.PersonId && d.Date.Date == r.Date && d.Shift == r.Shift))
                {
                    restored.Remove(r);
                    continue;
                }
                if (r.LeaveCategoryId is int catId && !validCategoryIds.Contains(catId))
                    r.LeaveCategoryId = null; // verlofregel intussen verwijderd: gewoon verlof

                _db.DayOffs.Add(new DayOff
                {
                    PersonId = r.PersonId,
                    Date = r.Date,
                    Shift = r.Shift,
                    LeaveCategoryId = r.LeaveCategoryId,
                    Description = "",
                    Status = DayOffstatus.Approved,
                    LastUpdate = DateTime.Now,
                    IsDeleted = false
                });
            }

            _db.LotteryDraws.Remove(draw);
            await _db.SaveChangesAsync();

            return Ok(restored);
        }

        // POST: api/lottery/draw/{drawNumber}/apply
        // Loting toepassen: verliezers verliezen hun verlof op de shift(en) van de loting.
        // Per ploeg valt op een datum maar één shift (D op dag X, N op dag X+1), dus alle verlof binnen de periode.
        // Wat weggehaald wordt, wordt onthouden om terug te zetten als de loting verwijderd wordt.
        [HttpPost("draw/{drawNumber}/apply")]
        public async Task<ActionResult<List<RestoredDayOffDTO>>> ApplyDraw(int drawNumber)
        {
            var draw = await _db.LotteryDraws
                .Include(d => d.Winners)
                .Include(d => d.Losers)
                .FirstOrDefaultAsync(d => d.DrawNumber == drawNumber);

            if (draw == null)
                return NotFound();

            var participants = draw.Winners.Select(w => w.PersonId).Concat(draw.Losers.Select(l => l.PersonId));
            if (!AllAllowed(participants, await AllowedPersonIdsAsync()))
                return Forbid();

            // Zelfde recht als opslaan in de teamkalender, voor de ploeg(en) en specialiteit(en) van de deelnemers
            if (!_me.IsAdmin)
            {
                var ids = participants.Distinct().ToList();
                var groups = await _db.Persons.AsNoTracking()
                    .Where(p => ids.Contains(p.Id) && p.Team != null && p.Speciality != null)
                    .Select(p => new { Team = p.Team!.Value, Speciality = p.Speciality!.Value })
                    .Distinct()
                    .ToListAsync();
                foreach (var g in groups)
                {
                    var perms = await _access.GetPermissionsAsync(User, g.Team, g.Speciality, draw.FromDate.Year);
                    if (!perms.CanSaveTeamCalendar)
                        return Forbid();
                }
            }

            var loserIds = draw.Losers.Select(l => l.PersonId).ToList();
            var from = draw.FromDate.Date;
            var to = draw.ToDate.Date;
            var dayOffs = await _db.DayOffs
                .Where(d => loserIds.Contains(d.PersonId) && d.Date >= from && d.Date < to.AddDays(1))
                .ToListAsync();

            var removed = new List<RestoredDayOffDTO>();
            foreach (var d in dayOffs)
            {
                var loser = draw.Losers.First(l => l.PersonId == d.PersonId);
                if (d.Shift == "N")
                {
                    loser.RemovedNight = true;
                    loser.NightLeaveCategoryId = d.LeaveCategoryId;
                }
                else
                {
                    loser.RemovedDay = true;
                    loser.DayLeaveCategoryId = d.LeaveCategoryId;
                }
                removed.Add(new RestoredDayOffDTO { PersonId = d.PersonId, Date = d.Date.Date, Shift = d.Shift ?? "", LeaveCategoryId = d.LeaveCategoryId });
            }

            _db.DayOffs.RemoveRange(dayOffs);
            await _db.SaveChangesAsync();

            return Ok(removed);
        }
    }
}
