using System;
using System.Linq;

namespace VerlofBWZC.DataContracts
{
    // Wachtwoordregels, gedeeld door de server (bindend) en de website (meteen feedback).
    // Minstens 8 tekens en geen voor de hand liggend wachtwoord (lijst, naam of e-mailadres).
    public static class PasswordPolicy
    {
        public const int MinLength = 8;
        public const int MaxLength = 128;

        private static readonly string[] Blocked =
        {
            "root1234", "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000",
            "password", "password1", "wachtwoord", "wachtwoord1", "azerty123", "qwerty123", "abcd1234",
            "welkom01", "welkom123", "brandweer", "brandweer1", "brandweer123", "verlof123", "planner1"
        };

        // null = in orde, anders de reden (Nederlands, voor de gebruiker)
        public static string? Validate(string? password, string? email = null, string? firstName = null, string? lastName = null)
        {
            if (string.IsNullOrEmpty(password) || password.Length < MinLength)
                return $"Het wachtwoord moet minstens {MinLength} tekens lang zijn.";
            if (password.Length > MaxLength)
                return $"Het wachtwoord mag maximaal {MaxLength} tekens lang zijn.";

            var lower = password.ToLowerInvariant();
            if (Blocked.Contains(lower))
                return "Dit wachtwoord is te voor de hand liggend. Kies een ander.";
            if (password.Distinct().Count() < 4)
                return "Gebruik meer verschillende tekens in je wachtwoord.";

            var localPart = email?.Split('@')[0].ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(localPart) && localPart.Length >= 3 && lower.Contains(localPart))
                return "Het wachtwoord mag je e-mailadres niet bevatten.";
            foreach (var name in new[] { firstName, lastName })
            {
                var n = name?.Replace(" ", "").ToLowerInvariant();
                if (!string.IsNullOrWhiteSpace(n) && n.Length >= 3 && lower.Replace(" ", "").Contains(n))
                    return "Het wachtwoord mag je naam niet bevatten.";
            }
            return null;
        }
    }
}
