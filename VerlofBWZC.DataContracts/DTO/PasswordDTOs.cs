namespace VerlofBWZC.DataContracts.DTO
{
    // Zelf je wachtwoord wijzigen (ook verplicht na een tijdelijk wachtwoord)
    public class ChangePasswordDTO
    {
        public string CurrentPassword { get; set; } = "";
        public string NewPassword { get; set; } = "";
    }

    // Eenmalig getoond tijdelijk wachtwoord (bij aanmaken of resetten door Admin/Manager)
    public class TemporaryPasswordDTO
    {
        public int PersonId { get; set; }
        public string TemporaryPassword { get; set; } = "";
    }

    // Antwoord van login en wachtwoord wijzigen
    public class LoginResultDTO
    {
        public string Token { get; set; } = "";
        public bool MustChangePassword { get; set; }
    }
}
