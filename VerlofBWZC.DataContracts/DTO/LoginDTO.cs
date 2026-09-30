using System;

namespace VerlofBWZC.DataContracts.DTO
{
    public class LoginDTO
    {

        public string Email { get; set; }
        public string Password { get; set; }

        // "Ingelogd blijven op dit toestel": 30 dagen (verlengd bij gebruik); anders 12 uur
        public bool RememberMe { get; set; }
    }
}
