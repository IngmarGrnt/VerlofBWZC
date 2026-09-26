using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.Api.Services
{
    // De ingelogde gebruiker: id, rol, ploeg en specialiteit.
    // In demo modus komen rol/ploeg/specialiteit uit de demo-token (claims), anders uit de databank.
    public class UserContext
    {
        public const string DemoClaim = "demo";
        public const string TeamClaim = "team";
        public const string SpecialityClaim = "speciality";

        private readonly IHttpContextAccessor _http;
        private readonly VerlofBWZC_DbContext _db;
        private (TeamName? Team, Speciality? Speciality)? _cached;

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

        // Lezen van teamgegevens: Admin alles; anderen enkel hun eigen ploeg én specialiteit
        public async Task<bool> CanReadTeamAsync(TeamName team, Speciality? speciality)
        {
            if (IsAdmin)
                return true;
            if (speciality == null)
                return false;

            var own = await GetTeamAsync();
            return own.Team == team && own.Speciality == speciality;
        }

        // Beheren (regels, personen van het team): Admin alles; Manager enkel eigen ploeg én specialiteit
        public async Task<bool> CanManageTeamAsync(TeamName? team, Speciality? speciality)
        {
            if (IsAdmin)
                return true;
            if (!IsManager || team == null || speciality == null)
                return false;

            var own = await GetTeamAsync();
            return own.Team == team && own.Speciality == speciality;
        }
    }
}
