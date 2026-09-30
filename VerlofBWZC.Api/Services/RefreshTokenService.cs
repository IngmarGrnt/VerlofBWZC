using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;

namespace VerlofBWZC.Api.Services
{
    // Vernieuwingstokens ("ingelogd blijven"). Het toestel krijgt een willekeurige waarde; in de databank staat enkel
    // de SHA-256-hash. Bij elk gebruik wordt het token vervangen (rotatie). Intrekken bij uitloggen, wachtwoord
    // wijzigen of resetten. Een persoon verwijderen verwijdert zijn tokens mee (cascade).
    public class RefreshTokenService
    {
        // Aangevinkt: 30 dagen, telkens opnieuw vanaf het laatste gebruik. Niet aangevinkt: 12 uur vanaf het inloggen.
        public static readonly TimeSpan RememberFor = TimeSpan.FromDays(30);
        public static readonly TimeSpan SessionFor = TimeSpan.FromHours(12);

        private readonly VerlofBWZC_DbContext _db;

        public RefreshTokenService(VerlofBWZC_DbContext db) => _db = db;

        public async Task<string> IssueAsync(int personId, bool remember)
        {
            var now = DateTime.UtcNow;
            var plain = NewTokenValue();
            _db.RefreshTokens.Add(new RefreshToken
            {
                PersonId = personId,
                TokenHash = Hash(plain),
                Remember = remember,
                CreatedAtUtc = now,
                ExpiresAtUtc = now + (remember ? RememberFor : SessionFor),
                LastUpdate = DateTime.Now
            });

            // Opruimen: verlopen of al lang ingetrokken tokens van deze persoon
            var old = await _db.RefreshTokens
                .Where(r => r.PersonId == personId && (r.ExpiresAtUtc < now || (r.RevokedAtUtc != null && r.RevokedAtUtc < now.AddDays(-7))))
                .ToListAsync();
            _db.RefreshTokens.RemoveRange(old);

            await _db.SaveChangesAsync();
            return plain;
        }

        // Geldig token inruilen voor een nieuw. Geeft de persoon en het nieuwe token, of null als het niet (meer) geldig is.
        public async Task<(Person Person, string Token)?> RotateAsync(string? plain)
        {
            if (string.IsNullOrWhiteSpace(plain))
                return null;

            var now = DateTime.UtcNow;
            var hash = Hash(plain);
            var current = await _db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash);
            if (current == null || current.RevokedAtUtc != null || current.ExpiresAtUtc <= now)
                return null;

            var person = await _db.Persons.FirstOrDefaultAsync(p => p.Id == current.PersonId);
            // Verwijderd, niet goedgekeurd of eerst een nieuw wachtwoord kiezen: opnieuw inloggen
            if (person == null || person.IsDeleted || !person.IsApproved || person.MustChangePassword)
            {
                current.RevokedAtUtc = now;
                await _db.SaveChangesAsync();
                return null;
            }

            current.RevokedAtUtc = now;
            var next = NewTokenValue();
            _db.RefreshTokens.Add(new RefreshToken
            {
                PersonId = person.Id,
                TokenHash = Hash(next),
                Remember = current.Remember,
                CreatedAtUtc = current.CreatedAtUtc,
                // Ingelogd blijven: verlengen; anders blijft het einde 12 uur na het inloggen
                ExpiresAtUtc = current.Remember ? now + RememberFor : current.ExpiresAtUtc,
                LastUpdate = DateTime.Now
            });
            await _db.SaveChangesAsync();
            return (person, next);
        }

        // Uitloggen op dit toestel
        public async Task RevokeAsync(string? plain)
        {
            if (string.IsNullOrWhiteSpace(plain))
                return;
            var hash = Hash(plain);
            var token = await _db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash && r.RevokedAtUtc == null);
            if (token == null)
                return;
            token.RevokedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        // Alle toestellen van een persoon afmelden (wachtwoord gewijzigd of gereset)
        public async Task RevokeAllAsync(int personId)
        {
            var now = DateTime.UtcNow;
            var tokens = await _db.RefreshTokens.Where(r => r.PersonId == personId && r.RevokedAtUtc == null).ToListAsync();
            foreach (var t in tokens)
                t.RevokedAtUtc = now;
            await _db.SaveChangesAsync();
        }

        private static string NewTokenValue() =>
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        private static string Hash(string plain) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plain)));
    }
}
