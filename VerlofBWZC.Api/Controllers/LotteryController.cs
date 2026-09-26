using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess.Entities;
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

        public LotteryController(VerlofBWZC_DbContext db, ILogger<LotteryController> logger, UserContext me)
        {
            _db = db;
            _logger = logger;
            _me = me;
        }

        // Personen waarover de gebruiker lotingen mag zien/beheren: null = alle (Admin), anders eigen ploeg + specialiteit
        private async Task<HashSet<int>?> AllowedPersonIdsAsync()
        {
            if (_me.IsAdmin)
                return null;

            var own = await _me.GetTeamAsync();
            var ids = await _db.Persons
                .Where(p => p.Team == own.Team && p.Speciality == own.Speciality)
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
                    LastName = l.LastName
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

                return Ok();
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

            _db.LotteryDraws.Remove(draw);
            await _db.SaveChangesAsync();

            return NoContent();
        }
    }
}
