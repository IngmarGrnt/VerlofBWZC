using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddLotteryLoserRemovedLeave : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DayLeaveCategoryId",
                table: "LotteryLosers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NightLeaveCategoryId",
                table: "LotteryLosers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RemovedDay",
                table: "LotteryLosers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RemovedNight",
                table: "LotteryLosers",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DayLeaveCategoryId",
                table: "LotteryLosers");

            migrationBuilder.DropColumn(
                name: "NightLeaveCategoryId",
                table: "LotteryLosers");

            migrationBuilder.DropColumn(
                name: "RemovedDay",
                table: "LotteryLosers");

            migrationBuilder.DropColumn(
                name: "RemovedNight",
                table: "LotteryLosers");
        }
    }
}
