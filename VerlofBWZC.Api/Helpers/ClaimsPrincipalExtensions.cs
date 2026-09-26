using System.Security.Claims;

namespace VerlofBWZC.Api.Helpers
{
    public static class ClaimsPrincipalExtensions
    {
        // De JWT-middleware mapt "sub" naar ClaimTypes.NameIdentifier en "role" naar ClaimTypes.Role
        public static int? GetUserId(this ClaimsPrincipal user)
        {
            var id = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("sub")?.Value;
            return int.TryParse(id, out var personId) ? personId : null;
        }

        public static bool IsAdmin(this ClaimsPrincipal user) => user.IsInRole("Admin");

        public static bool IsAdminOrManager(this ClaimsPrincipal user) => user.IsInRole("Admin") || user.IsInRole("Manager");

        // Eigen gegevens, of beheerder
        public static bool IsSelfOrAdminOrManager(this ClaimsPrincipal user, int personId)
            => user.GetUserId() == personId || user.IsAdminOrManager();
    }
}
