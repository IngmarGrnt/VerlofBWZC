using System;
using System.Security.Cryptography;

namespace VerlofBWZC.Api.Helpers
{
    public static class PasswordHelper
    {
        // PBKDF2-SHA256; aanbeveling OWASP 2023: 600.000 herhalingen. Oudere hashes (100.000) worden bij login omgezet.
        public const int CurrentIterations = 600_000;

        public static void CreatePasswordHash(string password, out string hash, out string salt)
        {
            byte[] saltBytes = RandomNumberGenerator.GetBytes(16);
            salt = Convert.ToBase64String(saltBytes);
            hash = Convert.ToBase64String(Derive(password, saltBytes, CurrentIterations));
        }

        public static bool VerifyPassword(string password, string storedHash, string storedSalt, int iterations)
        {
            if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(storedHash) || string.IsNullOrEmpty(storedSalt))
                return false;
            try
            {
                var expected = Convert.FromBase64String(storedHash);
                var actual = Derive(password, Convert.FromBase64String(storedSalt), iterations > 0 ? iterations : 100_000);
                // Vergelijken in constante tijd
                return CryptographicOperations.FixedTimeEquals(actual, expected);
            }
            catch (FormatException)
            {
                return false;
            }
        }

        // Tijdelijk wachtwoord bij aanmaken of resetten: 12 tekens, zonder verwarrende tekens (0/O, 1/l/I)
        public static string GenerateTemporaryPassword()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
            Span<char> result = stackalloc char[12];
            for (int i = 0; i < result.Length; i++)
                result[i] = chars[RandomNumberGenerator.GetInt32(chars.Length)];
            // Leesbaar in blokjes: Abcd-Efgh-Jkmn
            return $"{new string(result[..4])}-{new string(result[4..8])}-{new string(result[8..])}";
        }

        private static byte[] Derive(string password, byte[] salt, int iterations) =>
            Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, 32);
    }
}
