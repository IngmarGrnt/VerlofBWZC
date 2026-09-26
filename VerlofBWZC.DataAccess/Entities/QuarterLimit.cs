using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.DataAccess.Entities
{
    // Maximum aantal verlofshiften per kwartaal (KW1 jan-apr, KW2 mei-aug, KW3 sep-dec) per ploeg en specialiteit.
    // Year null = standaard voor alle jaren; een regel voor een specifiek jaar vervangt de standaard.
    public class QuarterLimit : BaseEntity
    {
        public TeamName Team { get; set; }
        public Speciality Speciality { get; set; }
        public int? Year { get; set; }

        public int Q1Max { get; set; }
        public int Q2Max { get; set; }
        public int Q3Max { get; set; }
    }
}
