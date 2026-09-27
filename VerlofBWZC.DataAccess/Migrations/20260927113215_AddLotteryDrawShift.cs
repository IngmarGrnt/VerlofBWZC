using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddLotteryDrawShift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Shift",
                table: "LotteryDraws",
                type: "nvarchar(1)",
                maxLength: 1,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Shift",
                table: "LotteryDraws");
        }
    }
}
