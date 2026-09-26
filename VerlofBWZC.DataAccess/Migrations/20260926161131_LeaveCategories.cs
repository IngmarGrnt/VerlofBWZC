using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class LeaveCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LeaveCategoryId",
                table: "DayOffs",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LeaveCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Team = table.Column<int>(type: "int", nullable: false),
                    Speciality = table.Column<int>(type: "int", nullable: false),
                    Year = table.Column<int>(type: "int", nullable: true),
                    Name = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    MaxShifts = table.Column<int>(type: "int", nullable: false),
                    Color = table.Column<string>(type: "nvarchar(9)", maxLength: 9, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    LastUpdate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LeaveCategories", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DayOffs_LeaveCategoryId",
                table: "DayOffs",
                column: "LeaveCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_LeaveCategories_Team_Speciality_Year",
                table: "LeaveCategories",
                columns: new[] { "Team", "Speciality", "Year" });

            migrationBuilder.AddForeignKey(
                name: "FK_DayOffs_LeaveCategories_LeaveCategoryId",
                table: "DayOffs",
                column: "LeaveCategoryId",
                principalTable: "LeaveCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DayOffs_LeaveCategories_LeaveCategoryId",
                table: "DayOffs");

            migrationBuilder.DropTable(
                name: "LeaveCategories");

            migrationBuilder.DropIndex(
                name: "IX_DayOffs_LeaveCategoryId",
                table: "DayOffs");

            migrationBuilder.DropColumn(
                name: "LeaveCategoryId",
                table: "DayOffs");
        }
    }
}
