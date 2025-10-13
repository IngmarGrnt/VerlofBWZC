namespace VerlofBWZC.DTO.DTO.Holidays
{
    public class SchoolHolidayDTO
    {
        public List<NameTranslationDTO> Name { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string Type { get; set; }
    }

}
