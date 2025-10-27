using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataContracts.DTO.Lottery;

namespace VerlofBWZC.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class LotteryController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _db;
        private readonly ILogger<LotteryController> _logger;

        public LotteryController(VerlofBWZC_DbContext db, ILogger<LotteryController> logger)
        {
            _db = db;
            _logger = logger;
        }

        // GET: api/lottery/draws
        [HttpGet("draws")]
        public async Task<ActionResult<IEnumerable<LotteryDrawDTO>>> GetDraws()
        {
            var draws = await _db.LotteryDraws
                .Include(d => d.Winners)
                .Include(d => d.Losers)
                .OrderBy(d => d.DrawNumber)
                .ThenBy(d => d.CreatedAtUtc)
                .ToListAsync();

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

            try
            {
                var entity = new LotteryDraw
                {
                    DrawNumber = dto.DrawNumber,
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

            _db.LotteryDraws.Remove(draw);
            await _db.SaveChangesAsync();

            return NoContent();
        }
    }
}
