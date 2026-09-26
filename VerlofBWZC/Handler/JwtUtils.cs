using System.Text;
using System.Text.Json;

namespace VerlofBWZC.Handler
{
    public static class JwtUtils
    {
        public static string? GetUserIdFromToken(string? token)
        {
            if (string.IsNullOrEmpty(token)) return null;
            var parts = token.Split('.');
            if (parts.Length != 3) return null;
            var payload = parts[1];
            switch (payload.Length % 4)
            {
                case 2: payload += "=="; break;
                case 3: payload += "="; break;
            }
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
            var doc = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier", out var id))
                return id.GetString();

            if (doc.RootElement.TryGetProperty("sub", out var sub))
                return sub.GetString();

            return null;
        }

        public static string? GetUserRolFromToken(string? token)
        {
            if (string.IsNullOrEmpty(token)) return null;
            var parts = token.Split('.');
            if (parts.Length != 3) return null;
            var payload = parts[1];
            switch (payload.Length % 4)
            {
                case 2: payload += "=="; break;
                case 3: payload += "="; break;
            }
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
            var doc = JsonDocument.Parse(json);

            // Probeer de meest voorkomende rol-claims
            if (doc.RootElement.TryGetProperty("role", out var role))
            {
                Console.WriteLine($"User Role: {role.GetString()}");
                return role.GetString();
            }

            if (doc.RootElement.TryGetProperty("roles", out var roles))
            {
                // Kan een array zijn
                if (roles.ValueKind == JsonValueKind.Array)
                    return roles.EnumerateArray().FirstOrDefault().GetString();
                return roles.GetString();
            }

            if (doc.RootElement.TryGetProperty("http://schemas.microsoft.com/ws/2008/06/identity/claims/role", out var msRole))
                return msRole.GetString();

            return null;
        }

        // Losse string-claim uit de token (bv. "team", "speciality", "demo")
        public static string? GetClaim(string? token, string name)
        {
            if (string.IsNullOrEmpty(token)) return null;
            var parts = token.Split('.');
            if (parts.Length != 3) return null;
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            switch (payload.Length % 4)
            {
                case 2: payload += "=="; break;
                case 3: payload += "="; break;
            }
            try
            {
                using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)));
                return doc.RootElement.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            }
            catch
            {
                return null;
            }
        }

        // Demo modus: admin bekijkt de app als een andere rol/ploeg/specialiteit
        public static bool IsDemo(string? token) => GetClaim(token, "demo") == "true";
    }
}
