using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.Api.Services
{
    // De ingelogde gebruiker: id, rol, ploeg en specialiteit, en welke ploegen/specialiteiten hij mag zien of beheren.
    // In demo modus komen rol/ploeg/specialiteit uit de demo-token (claims), anders uit de databank.
    public class UserContext
    {
        public const string DemoClaim = "demo";
        public const string TeamClaim = "team";
        public const string SpecialityClaim = "speciality";

        // Een ploeg met een specialiteit, of (Speciality null) alle specialiteiten van die ploeg
        public record Scope(TeamName Team, Speciality? Speciality)
        {
            public bool Covers(TeamName team, Speciality? speciality) =>
                Team == team && (Speciality == null || Speciality == speciality);
        }

        private readonly IHttpContextAccessor _http;
        private readonly VerlofBWZC_DbContext _db;
        private (TeamName? Team, Speciality? Speciality)? _cached;
        private List<Scope>? _scopes;

        public UserContext(IHttpContextAccessor http, VerlofBWZC_DbContext db)
        {
            _http = http;
            _db = db;
        }

        public ClaimsPrincipal User => _http.HttpContext?.User ?? new ClaimsPrincipal();
        public int? Id => User.GetUserId();
        public bool IsDemo => User.FindFirst(DemoClaim)?.Value == "true";
        public bool IsAdmin => User.IsAdmin();
        public bool IsManager => !IsAdmin && User.IsInRole("Manager");

        // Eigen ploeg en specialiteit (werkkalender, eigen verlofregels)
        public async Task<(TeamName? Team, Speciality? Speciality)> GetTeamAsync()
        {
            if (_cached != null)
                return _cached.Value;

            if (IsDemo)
            {
                var team = Enum.TryParse<TeamName>(User.FindFirst(TeamClaim)?.Value, out var t) ? t : (TeamName?)null;
                var spec = Enum.TryParse<Speciality>(User.FindFirst(SpecialityClaim)?.Value, out var s) ? s : (Speciality?)null;
                _cached = (team, spec);
            }
            else
            {
                var id = Id;
                var me = await _db.Persons.AsNoTracking()
                    .Where(p => p.Id == id)
                    .Select(p => new { p.Team, p.Speciality })
                    .FirstOrDefaultAsync();
                _cached = (me?.Team, me?.Speciality);
            }
            return _cached.Value;
        }

        // Wat de gebruiker ziet (en als Manager beheert): eigen ploeg + specialiteit,
        // voor een Manager aangevuld met de ploegen die de Admin hem gaf. Niet gebruikt voor Admin (die ziet alles).
        public async Task<IReadOnlyList<Scope>> GetScopesAsync()
        {
            if (_scopes != null)
                return _scopes;

            var scopes = new List<Scope>();
            var own = await GetTeamAsync();
            if (own.Team != null && own.Speciality != null)
                scopes.Add(new Scope(own.Team.Value, own.Speciality.Value));

            // Demo modus: de gekozen ploeg en specialiteit, plus de extra ploegen die de admin koos (claim demo_scopes)
            if (IsManager && IsDemo)
            {
                foreach (var part in (User.FindFirst(JwtTokenHelper.DemoScopesClaim)?.Value ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries))
                {
                    var bits = part.Split(':');
                    if (bits.Length != 2 || !Enum.TryParse<TeamName>(bits[0], out var t))
                        continue;
                    if (bits[1] == "*")
                        scopes.Add(new Scope(t, null));
                    else if (Enum.TryParse<Speciality>(bits[1], out var sp))
                        scopes.Add(new Scope(t, sp));
                }
            }
            else if (IsManager && Id is int id)
            {
                var extra = await _db.ManagerScopes.AsNoTracking()
                    .Where(s => s.PersonId == id)
                    .Select(s => new Scope(s.Team, s.Speciality))
                    .ToListAsync();
                scopes.AddRange(extra);
            }

            _scopes = scopes.Distinct().ToList();
            return _scopes;
        }

        // Alle (ploeg, specialiteit)-combinaties binnen de scopes, voor filters in databankqueries
        public async Task<List<int>> GetScopeKeysAsync()
        {
            var keys = new List<int>();
            foreach (var s in await GetScopesAsync())
            {
                if (s.Speciality is Speciality spec)
                    keys.Add(Key(s.Team, spec));
                else
                    keys.AddRange(Enum.GetValues<Speciality>().Select(sp => Key(s.Team, sp)));
            }
            return keys.Distinct().ToList();
        }

        // Sleutel voor een (ploeg, specialiteit): in queries te gebruiken als keys.Contains(ploeg * 100 + specialiteit)
        public static int Key(TeamName team, Speciality speciality) => (int)team * 100 + (int)speciality;

        // Lezen van teamgegevens: Admin alles; anderen binnen hun scopes.
        // Zonder specialiteit (hele ploeg): enkel met "alle specialiteiten" van die ploeg.
        public async Task<bool> CanReadTeamAsync(TeamName team, Speciality? speciality)
        {
            if (IsAdmin)
                return true;

            var scopes = await GetScopesAsync();
            return speciality == null
                ? scopes.Any(s => s.Team == team && s.Speciality == null)
                : scopes.Any(s => s.Covers(team, speciality));
        }

        // Beheren (regels, personen, teamkalender, lotingen): Admin alles; Manager binnen zijn scopes
        public async Task<bool> CanManageTeamAsync(TeamName? team, Speciality? speciality)
        {
            if (IsAdmin)
                return true;
            if (!IsManager || team == null || speciality == null)
                return false;

            return (await GetScopesAsync()).Any(s => s.Covers(team.Value, speciality.Value));
        }
    }
}
