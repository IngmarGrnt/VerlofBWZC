using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.DataAccess.Entities
{
    // Maximum aantal personen met verlof per shift (quota), per ploeg en specialiteit.
    // Year null = standaard voor alle jaren; een regel voor een specifiek jaar vervangt de standaard.
    // Geen regel = standaard: een kwart van de personen (minstens 1).
    public class ShiftQuota : BaseEntity
    {
        public TeamName Team { get; set; }
        public Speciality Speciality { get; set; }
        public int? Year { get; set; }

        public int DayMax { get; set; }
        public int NightMax { get; set; }
    }
}
