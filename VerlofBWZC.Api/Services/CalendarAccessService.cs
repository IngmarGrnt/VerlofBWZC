using System;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts.DTO.Access;

namespace VerlofBWZC.Api.Services
{
    public class CalendarAccessService
    {
        private readonly VerlofBWZC_DbContext _db;

        public CalendarAccessService(VerlofBWZC_DbContext db) => _db = db;

        public async Task<CalendarPermissionsDTO> GetPermissionsAsync(ClaimsPrincipal user, TeamName team, Speciality speciality, int year, string role)
        {
            // Admins always allowed
            if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
                return new CalendarPermissionsDTO(true, true, true);

            // Query matching rules (exact year first, then default)
            var rules = await _db.Set<CalendarAccessRule>()
                .Where(r => r.Team == team && r.Speciality == speciality && (r.Year == year || r.Year == null))
                .OrderByDescending(r => r.Year.HasValue) // Year-specific overrides default
                .AsNoTracking()
                .ToListAsync();

            var rule = rules.FirstOrDefault();
            if (rule == null)
                return new CalendarPermissionsDTO(false, false, false);

            return new CalendarPermissionsDTO(
                rule.CanSeeTeamCalendar,
                rule.CanSaveWorkCalendar,
                rule.CanSaveTeamCalendar
            );
        }
    }
}
