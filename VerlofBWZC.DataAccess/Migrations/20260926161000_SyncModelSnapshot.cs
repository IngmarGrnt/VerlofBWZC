using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <summary>
    /// Brengt de model-snapshot in lijn met de bestaande databank. De tabel heet in de databank
    /// al CalendarAccessRules, dus er valt niets uit te voeren.
    /// </summary>
    public partial class SyncModelSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}