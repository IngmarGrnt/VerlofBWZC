using System;

namespace VerlofBWZC.DataAccess.Entities
{
    // Vernieuwingstoken: "ingelogd blijven" op een toestel. Enkel de SHA-256-hash wordt bewaard, nooit het token zelf.
    // Bij elk gebruik wordt het vervangen door een nieuw (RevokedAtUtc gezet). Intrekken: uitloggen, wachtwoord wijzigen of resetten.
    public class RefreshToken : BaseEntity
    {
        public int PersonId { get; set; }
        public string TokenHash { get; set; } = string.Empty;

        // Aangevinkt "Ingelogd blijven": 30 dagen, telkens verlengd bij gebruik; anders 12 uur vanaf het inloggen
        public bool Remember { get; set; }

        public DateTime CreatedAtUtc { get; set; }
        public DateTime ExpiresAtUtc { get; set; }
        public DateTime? RevokedAtUtc { get; set; }
    }
}
