using Microsoft.EntityFrameworkCore;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.Api.Services
{
    public class LeaveCategoryService
    {
        private readonly VerlofBWZC_DbContext _db;

        public LeaveCategoryService(VerlofBWZC_DbContext db) => _db = db;

        // Categorieën voor een specifiek jaar vervangen de standaardcategorieën (Year = null)
        public async Task<List<LeaveCategory>> GetApplicableAsync(TeamName team, Speciality speciality, int year)
        {
            var candidates = await _db.LeaveCategories
                .AsNoTracking()
                .Where(c => c.Team == team && c.Speciality == speciality && (c.Year == year || c.Year == null))
                .ToListAsync();

            return PickForYear(candidates, year);
        }

        // Toepasselijke categorieën voor alle specialiteiten van een ploeg (voor de teamkalender)
        public async Task<List<LeaveCategory>> GetApplicableForTeamAsync(TeamName team, int year)
        {
            var candidates = await _db.LeaveCategories
                .AsNoTracking()
                .Where(c => c.Team == team && (c.Year == year || c.Year == null))
                .ToListAsync();

            return candidates
                .GroupBy(c => c.Speciality)
                .SelectMany(g => PickForYear(g.ToList(), year))
                .ToList();
        }

        private static List<LeaveCategory> PickForYear(List<LeaveCategory> candidates, int year)
        {
            var specific = candidates.Where(c => c.Year == year).ToList();
            var chosen = specific.Count > 0 ? specific : candidates.Where(c => c.Year == null).ToList();
            return chosen.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToList();
        }
    }
}
