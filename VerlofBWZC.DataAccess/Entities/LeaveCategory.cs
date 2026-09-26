using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.DataAccess.Entities
{
    // Verlofcategorie (bv. "Groot verlof" max 8 shiften) per ploeg en specialiteit.
    // Year null = standaard voor alle jaren; categorieën voor een specifiek jaar vervangen de standaard.
    public class LeaveCategory : BaseEntity
    {
        public TeamName Team { get; set; }
        public Speciality Speciality { get; set; }
        public int? Year { get; set; }

        public string Name { get; set; } = "";
        public int MaxShifts { get; set; }
        public string Color { get; set; } = "#E53935";
        public int SortOrder { get; set; }
    }
}
