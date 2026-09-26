namespace VerlofBWZC.DataContracts.DTO.Leave
{
    // Verlofcategorie per ploeg en specialiteit, bv. "Groot verlof" met max 8 shiften
    public class LeaveCategoryDTO
    {
        public int Id { get; set; }
        public string Team { get; set; } = string.Empty;
        public string Speciality { get; set; } = string.Empty;
        public int? Year { get; set; }
        public string Name { get; set; } = string.Empty;
        public int MaxShifts { get; set; }
        public string Color { get; set; } = "#E8590C";
        public int SortOrder { get; set; }

        // Shiften moeten aansluitend zijn (één ononderbroken reeks in het werkrooster)
        public bool MustBeConsecutive { get; set; }
    }
}
