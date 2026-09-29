using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts.DTO.Access;

namespace VerlofBWZC.Api.Controllers
{
    // Welke ploegen/specialiteiten een manager beheert (bovenop zijn eigen ploeg en specialiteit)
    [ApiController]
    public class ManagerScopeController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _db;
        private readonly UserContext _me;

        public ManagerScopeController(VerlofBWZC_DbContext db, UserContext me)
        {
            _db = db;
            _me = me;
        }

        // GET api/meta/my-scope — voor de keuzelijsten: Admin ziet alles, anderen hun scopes
        [HttpGet("api/meta/my-scope")]
        public async Task<ActionResult<MyScopeDTO>> GetMyScope()
        {
            if (_me.IsAdmin)
                return Ok(new MyScopeDTO { IsAdmin = true });

            var scopes = await _me.GetScopesAsync();
            var viewScopes = await _me.GetViewScopesAsync();
            return Ok(new MyScopeDTO
            {
                Scopes = scopes.Select(s => new ScopeItemDTO { Team = s.Team.ToString(), Speciality = s.Speciality?.ToString() }).ToList(),
                ViewScopes = viewScopes.Select(s => new ScopeItemDTO { Team = s.Team.ToString(), Speciality = s.Speciality?.ToString() }).ToList()
            });
        }

        // GET api/manager-scopes — alle extra scopes (Admin, Personen)
        [HttpGet("api/manager-scopes")]
        [Authorize(Roles = "Admin")]
        public async Task<ActionResult<IEnumerable<ManagerScopesDTO>>> GetAll()
        {
            var rows = await _db.ManagerScopes.AsNoTracking().ToListAsync();
            return Ok(rows
                .GroupBy(r => r.PersonId)
                .Select(g => new ManagerScopesDTO
                {
                    PersonId = g.Key,
                    Scopes = g.OrderBy(r => r.Team).ThenBy(r => r.Speciality)
                        .Select(r => new ScopeItemDTO { Team = r.Team.ToString(), Speciality = r.Speciality?.ToString() })
                        .ToList()
                }));
        }

        // PUT api/manager-scopes/{personId} — de lijst van een manager vervangen (Admin)
        [HttpPut("api/manager-scopes/{personId}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Replace(int personId, [FromBody] List<ScopeItemDTO> scopes)
        {
            if (_me.IsDemo)
                return Forbid();

            var person = await _db.Persons.FindAsync(personId);
            if (person == null)
                return NotFound();
            if (person.Role != Role.Manager)
                return BadRequest("Enkel een Manager kan extra ploegen beheren.");

            var parsed = new List<ManagerScope>();
            foreach (var s in scopes ?? new())
            {
                if (!Enum.TryParse<TeamName>(s.Team, true, out var team))
                    return BadRequest($"Ongeldige ploeg: {s.Team}");
                Speciality? spec = null;
                if (!string.IsNullOrWhiteSpace(s.Speciality))
                {
                    if (!Enum.TryParse<Speciality>(s.Speciality, true, out var sp))
                        return BadRequest($"Ongeldige specialiteit: {s.Speciality}");
                    spec = sp;
                }
                parsed.Add(new ManagerScope { PersonId = personId, Team = team, Speciality = spec });
            }

            // "Alle specialiteiten" van een ploeg maakt losse specialiteiten van die ploeg overbodig
            var allTeams = parsed.Where(p => p.Speciality == null).Select(p => p.Team).ToHashSet();
            parsed = parsed
                .Where(p => p.Speciality == null || !allTeams.Contains(p.Team))
                .GroupBy(p => (p.Team, p.Speciality)).Select(g => g.First())
                .ToList();

            var existing = await _db.ManagerScopes.Where(s => s.PersonId == personId).ToListAsync();
            _db.ManagerScopes.RemoveRange(existing);
            _db.ManagerScopes.AddRange(parsed);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
