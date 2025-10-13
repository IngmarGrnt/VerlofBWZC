namespace DTO
{
    public class SchoolHolidayDTO
    {
        public List<NameTranslationDTO> Name { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string Type { get; set; }
    }
    public class NameTranslationDTO
    {
        public string Language { get; set; }
        public string Text { get; set; }
    }
}
