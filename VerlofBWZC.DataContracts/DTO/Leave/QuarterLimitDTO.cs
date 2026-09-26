namespace VerlofBWZC.DataContracts.DTO.Leave
{
    // Kwartaalmaxima per ploeg en specialiteit (KW1 jan-apr, KW2 mei-aug, KW3 sep-dec)
    public class QuarterLimitDTO
    {
        public int Id { get; set; }
        public string Team { get; set; } = string.Empty;
        public string Speciality { get; set; } = string.Empty;
        public int? Year { get; set; }
        public int Q1Max { get; set; } = 14;
        public int Q2Max { get; set; } = 16;
        public int Q3Max { get; set; } = 14;

        // true als er geen regel is ingesteld en de standaardwaarden gelden
        public bool IsDefault { get; set; }

        // Kwartaal (1-3) van een datum
        public static int QuarterOf(DateTime date) => (date.Month - 1) / 4 + 1;

        public int MaxFor(int quarter) => quarter switch { 1 => Q1Max, 2 => Q2Max, _ => Q3Max };
    }
}
