using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddDayOffShift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Shift",
                table: "DayOffs",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Shift",
                table: "DayOffs");
        }
    }
}
