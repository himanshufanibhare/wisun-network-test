import re
import subprocess
import sys
from pprint import pprint
from collections import deque

def get_ipv6(string):
    """Extract IPv6 address from a given string"""
    ipv6_pattern = (
        r'(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|'
        r'(?:[0-9a-fA-F]{1,4}:)*(?:::)?(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}'
        r'(?:::)?(?:[0-9a-fA-F]{1,4}:)*(?:[0-9a-fA-F]{1,4})?'
    )
    match = re.search(ipv6_pattern, string)
    return match.group(0) if match else None


def generate_pattern(string): 
    """Generate a regex lookbehind pattern"""
    return f"(?<={string}: ).*"


def get_properties(input_string: str) -> dict:
    """Extract key:value pairs like 'Key: Value' from the top section"""
    key = re.findall(r"(\w+)\: ", input_string)
    value = re.findall(generate_pattern(r"\w"), input_string)
    return dict(zip(key, value))


def get_groups(input_string: str) -> list:
    """Extract network group info like GAK[0], GTK[0], etc."""
    key = re.findall(r"(?:GAK|GTK|LGAK|LGTK)\[\d\]", input_string)
    value = re.findall(generate_pattern(r"\S{3}\[\d\]"), input_string)
    return list(zip(key, value))


def get_tree(input_string: str, debug=False):
    """Parse the network tree based on indentation and symbols"""
    groups = get_groups(input_string)
    if not groups:
        raise Exception("Cannot get groups")

    # Split before and after the last group section
    top, bottom = input_string.split(f"{groups[-1][0]}: {groups[-1][1]}\n")
    bottom_lines = bottom.splitlines()

    # Find the first IPv6 address (border router)
    border_router = None
    for line in bottom_lines:
        ipv6 = get_ipv6(line)
        if ipv6:
            border_router = ipv6
            break

    if not border_router:
        raise Exception("Cannot find border router")

    tree = []
    parent_stack = [(0, border_router)]  # (indent_level, node)

    for line in bottom_lines:
        if not line.strip():
            continue

        # Count indentation (includes spaces, |, `, and -)
        indent_match = re.match(r"^[\s\|\-`]*", line)
        indent = len(indent_match.group(0)) if indent_match else 0

        current_node = get_ipv6(line)
        if not current_node:
            continue

        if debug:
            print(f"{' ' * indent}[Indent {indent}] {current_node}")

        # Adjust stack based on indentation
        while parent_stack and indent <= parent_stack[-1][0]:
            parent_stack.pop()

        if parent_stack:
            parent_node = parent_stack[-1][1]
            tree.append([parent_node, current_node])

        parent_stack.append((indent, current_node))

    return tree


def compute_hop_counts(tree_edges, root_node):
    """Compute hop counts from the root node to all others"""
    children = {}
    for parent, child in tree_edges:
        children.setdefault(parent, []).append(child)

    hop_counts = {root_node: 0}
    queue = deque([(root_node, 0)])

    while queue:
        current_node, current_hops = queue.popleft()
        for child in children.get(current_node, []):
            if child not in hop_counts:
                hop_counts[child] = current_hops + 1
                queue.append((child, current_hops + 1))

    return hop_counts


def get_dodac_properties(output_string: str, debug=False) -> dict:
    """Extract all network data: metadata, tree, hop counts, etc."""
    meta_data = get_properties(output_string)
    tree = get_tree(output_string, debug=debug)

    # Root node = first parent in the tree
    root_node = tree[0][0] if tree else None

    hop_counts = compute_hop_counts(tree, root_node) if root_node else {}

    return {
        **meta_data,
        "tree": tree,
        "hop_counts": hop_counts,
        "root_node": root_node
    }


def run_command(command, timeout=30):
    """Run a shell command and capture output"""
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=timeout
        )
        if result.returncode == 0:
            return result.stdout
        else:
            print(f"Command '{command}' failed with code {result.returncode}")
            print(f"Error: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        print(f"Command '{command}' timed out after {timeout}s")
        return None
    except Exception as e:
        print(f"Error running command '{command}': {e}")
        return None


def pretty_print_hop_counts(hop_counts, root_node):
    """Display hop counts in a formatted way"""
    print(f"\nHop Counts from Border Router ({root_node}):")
    print("=" * 60)

    sorted_hops = sorted(hop_counts.items(), key=lambda x: (x[1], x[0]))
    for node, hops in sorted_hops:
        print(f"Hop {hops:2d}: {node}")


def get_wisun_tree():
    """Get Wi-SUN network tree output"""
    try:
        # Run the command to get Wi-SUN tree status
        command_output = run_command("wsbrd_cli status", timeout=30)
        
        if command_output and command_output.strip():
            return command_output.strip()
        else:
            return None
    except Exception as e:
        print(f"Error getting Wi-SUN tree: {e}")
        return None


if __name__ == "__main__":
    DEFAULT_COMMAND = "wsbrd_cli status"

    print(f"Running command: '{DEFAULT_COMMAND}'")
    command_output = run_command(DEFAULT_COMMAND)

    if not command_output or not command_output.strip():
        print("No output received. Please check your command.")
        sys.exit(1)

    print("Parsing network topology...")

    try:
        # Change debug=True if you want to see indent levels
        result = get_dodac_properties(command_output, debug=False)

        print("\nNetwork Properties:")
        pprint({k: v for k, v in result.items() if k not in ['tree', 'hop_counts', 'root_node']})

        print(f"\nTree Structure ({len(result['tree'])} connections):")
        pprint(result['tree'])

        if result['hop_counts']:
            pretty_print_hop_counts(result['hop_counts'], result['root_node'])
        else:
            print("No hop counts calculated — check if tree parsing was successful.")

    except Exception as e:
        print(f"Error parsing command output: {e}")
        print("\nRaw command output:")
        print(command_output)
        sys.exit(1)
