"""
FastMCP quickstart example.

Run from the repository root:
    uv run examples/snippets/servers/fastmcp_quickstart.py
"""

from mcp.server.fastmcp import FastMCP
import os
# Create an MCP server
mcp = FastMCP("mcp-demo", json_response=True)


# Add an addition tool
@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b


# Add a dynamic greeting resource
@mcp.resource("greeting://{name}")
def get_greeting(name: str) -> str:
    """Get a personalized greeting"""
    return f"Hello, {name}!"


# Add a prompt
@mcp.prompt()
def greet_user(name: str, style: str = "friendly") -> str:
    """Generate a greeting prompt"""
    styles = {
        "friendly": "Please write a warm, friendly greeting",
        "formal": "Please write a formal, professional greeting",
        "casual": "Please write a casual, relaxed greeting",
    }

    return f"{styles.get(style, styles['friendly'])} for someone named {name}."

NOTES_FILE = os.path.join(os.path.dirname(__file__), "notes.txt")
def ensure_file():
    if not os.path.exists(NOTES_FILE):
        with open(NOTES_FILE, "w") as f:
            f.write("")

@mcp.tool()
def add_note(message: str) -> str:
    """
    Args:
        message (str): message to be appended to the note.

    Returns:
        str: message indicating success.
    """
    ensure_file()
    with open(NOTES_FILE, "a") as f:
        f.write(message)
    return "Note added!"


def main() -> None:
    mcp.run(transport="streamable-http")


# Run with streamable HTTP transport
if __name__ == "__main__":
    main()
