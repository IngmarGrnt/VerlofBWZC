using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VerlofBWZC.DataAccess.Migrations
{
    /// <inheritdoc />
    public partial class AddManagerScopes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ManagerScopes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PersonId = table.Column<int>(type: "int", nullable: false),
                    Team = table.Column<int>(type: "int", nullable: false),
                    Speciality = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManagerScopes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ManagerScopes_Persons_PersonId",
                        column: x => x.PersonId,
                        principalTable: "Persons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ManagerScopes_PersonId_Team_Speciality",
                table: "ManagerScopes",
                columns: new[] { "PersonId", "Team", "Speciality" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ManagerScopes");
        }
    }
}
