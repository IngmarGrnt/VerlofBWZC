namespace VerlofBWZC.DataContracts.DTO
{
    // Zelf registreren op de loginpagina; na goedkeuring door Admin/Manager kan de persoon inloggen
    public class RegisterDTO
    {
        public string FirstName { get; set; } = "";
        public string LastName { get; set; } = "";
        public string Email { get; set; } = "";
        public string Speciality { get; set; } = "";
        public string Grade { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public static class RegistrationRules
    {
        // Enkel adressen van de zone
        public const string EmailDomain = "@bwzc.be";

        // Voorlopig kan men zich enkel voor Ploeg1 registreren
        public const string Team = "Ploeg1";
    }
}
