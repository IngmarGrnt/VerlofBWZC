namespace VerlofBWZC.DataContracts.DTO.Leave
{
    // Maximum aantal personen met verlof per shift, per ploeg en specialiteit.
    // Year null = standaard voor alle jaren. Geen regel = een kwart van de personen (minstens 1).
    public class ShiftQuotaDTO
    {
        public int Id { get; set; }
        public string Team { get; set; } = string.Empty;
        public string Speciality { get; set; } = string.Empty;
        public int? Year { get; set; }
        public int DayMax { get; set; } = 5;
        public int NightMax { get; set; } = 5;

        public int MaxFor(string? shift) => shift == "N" ? NightMax : DayMax;

        // Standaard zonder regel: een kwart van de personen, minstens 1
        public static int DefaultFor(int members) => Werkregels.DefaultShiftQuota(members);
    }
}
