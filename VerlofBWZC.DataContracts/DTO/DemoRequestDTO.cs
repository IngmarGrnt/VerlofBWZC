namespace VerlofBWZC.DataContracts.DTO
{
    // Demo modus: admin bekijkt de app als deze rol, ploeg en specialiteit
    public class DemoRequestDTO
    {
        public string Role { get; set; } = "User";
        public string Team { get; set; } = string.Empty;
        public string Speciality { get; set; } = string.Empty;
    }
}
