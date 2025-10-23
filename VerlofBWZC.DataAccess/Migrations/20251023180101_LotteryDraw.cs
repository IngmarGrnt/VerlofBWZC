using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class LotteryDraw : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LotteryDraws",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DrawNumber = table.Column<int>(type: "int", nullable: false),
                    DrawName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FromDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ToDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LotteryDraws", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LotteryLosers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PersonId = table.Column<int>(type: "int", nullable: false),
                    FirstName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LastName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LotteryDrawId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LotteryLosers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LotteryLosers_LotteryDraws_LotteryDrawId",
                        column: x => x.LotteryDrawId,
                        principalTable: "LotteryDraws",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LotteryWinners",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PersonId = table.Column<int>(type: "int", nullable: false),
                    FirstName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LastName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LotteryDrawId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LotteryWinners", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LotteryWinners_LotteryDraws_LotteryDrawId",
                        column: x => x.LotteryDrawId,
                        principalTable: "LotteryDraws",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LotteryDraws_DrawNumber",
                table: "LotteryDraws",
                column: "DrawNumber");

            migrationBuilder.CreateIndex(
                name: "IX_LotteryLosers_LotteryDrawId",
                table: "LotteryLosers",
                column: "LotteryDrawId");

            migrationBuilder.CreateIndex(
                name: "IX_LotteryWinners_LotteryDrawId",
                table: "LotteryWinners",
                column: "LotteryDrawId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LotteryLosers");

            migrationBuilder.DropTable(
                name: "LotteryWinners");

            migrationBuilder.DropTable(
                name: "LotteryDraws");
        }
    }
}
