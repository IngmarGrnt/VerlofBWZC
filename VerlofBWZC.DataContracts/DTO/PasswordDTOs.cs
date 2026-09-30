namespace VerlofBWZC.DataContracts.DTO
{
    // Zelf je wachtwoord wijzigen (ook verplicht na een tijdelijk wachtwoord)
    public class ChangePasswordDTO
    {
        public string CurrentPassword { get; set; } = "";
        public string NewPassword { get; set; } = "";

        // Zelfde keuze als bij het inloggen: het nieuwe vernieuwingstoken 30 dagen of 12 uur geldig
        public bool RememberMe { get; set; }
    }

    // Eenmalig getoond tijdelijk wachtwoord (bij aanmaken of resetten door Admin/Manager)
    public class TemporaryPasswordDTO
    {
        public int PersonId { get; set; }
        public string TemporaryPassword { get; set; } = "";
    }

    // Antwoord van login, wachtwoord wijzigen en vernieuwen
    public class LoginResultDTO
    {
        public string Token { get; set; } = "";
        public bool MustChangePassword { get; set; }

        // Vernieuwingstoken ("ingelogd blijven"); leeg bij een beperkt token (eerst wachtwoord wijzigen)
        public string? RefreshToken { get; set; }
    }

    // Vernieuwen of uitloggen met het vernieuwingstoken van dit toestel
    public class RefreshRequestDTO
    {
        public string RefreshToken { get; set; } = "";
    }
}
