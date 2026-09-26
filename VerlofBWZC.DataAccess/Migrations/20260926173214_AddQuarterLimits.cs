using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddQuarterLimits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QuarterLimits",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Team = table.Column<int>(type: "int", nullable: false),
                    Speciality = table.Column<int>(type: "int", nullable: false),
                    Year = table.Column<int>(type: "int", nullable: true),
                    Q1Max = table.Column<int>(type: "int", nullable: false),
                    Q2Max = table.Column<int>(type: "int", nullable: false),
                    Q3Max = table.Column<int>(type: "int", nullable: false),
                    LastUpdate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuarterLimits", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QuarterLimits_Team_Speciality_Year",
                table: "QuarterLimits",
                columns: new[] { "Team", "Speciality", "Year" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QuarterLimits");
        }
    }
}
