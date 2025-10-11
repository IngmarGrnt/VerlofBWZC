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
    }
}
