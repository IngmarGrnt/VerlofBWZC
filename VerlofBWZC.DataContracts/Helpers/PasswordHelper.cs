using System;
using System.Security.Cryptography;

namespace VerlofBWZC.DataContracts.Helpers
{
    public static class PasswordHelper
    {
        public static void CreatePasswordHash(string password, out string hash, out string salt)
        {
            // Genereer een random salt
            byte[] saltBytes = RandomNumberGenerator.GetBytes(16);
            salt = Convert.ToBase64String(saltBytes);

            // Hash het wachtwoord met de salt
            var pbkdf2 = new Rfc2898DeriveBytes(password, saltBytes, 100_000, HashAlgorithmName.SHA256);
            hash = Convert.ToBase64String(pbkdf2.GetBytes(32));
        }

        public static bool VerifyPassword(string password, string storedHash, string storedSalt)
        {
            byte[] saltBytes = Convert.FromBase64String(storedSalt);
            var pbkdf2 = new Rfc2898DeriveBytes(password, saltBytes, 100_000, HashAlgorithmName.SHA256);
            string hash = Convert.ToBase64String(pbkdf2.GetBytes(32));
            return hash == storedHash;
        }
    }
}
