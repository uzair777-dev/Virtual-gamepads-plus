#!/bin/bash

# Ensure fzf is installed
if ! command -v fzf &>/dev/null; then
	echo "\"fzf\" could not be found. Please install it first."
	exit 1
fi

# Find all gamepad devices in /dev/input
gamepads=$(find /dev/input -name "js*")

if [ -z "$gamepads" ]; then
	echo "No gamepads found."
	echo "Press any key to exit..."
	read -r
	exit
elif [ "$(echo "$gamepads" | wc -l)" -eq 1 ]; then
	echo "󰊖 Only one gamepad found, it will be opened."
	trap 'clear && echo "Interrupted. Exiting..." && exit 1' INT
	jstest "$gamepads"
	trap - INT
	exit
fi

# Create an array of gamepad items
array=()
for ((i = 0; i < $(echo "$gamepads" | wc -l); i++)); do
	array+=("Gamepad $((i + 1))")
done

function selectGamepad() {
	clear

	# Select a gamepad using fzf
	if command -v fzf > /dev/null; then
		selected=$(printf "%s\n" "${array[@]}" | fzf --prompt "Select a gamepad: " --height 10 --cycle | awk -F" " '{print $2 - 1}')
	else
		PS3="Select a gamepad: "
		select gamepad in "${array[@]}"; do
			if [[ -n $gamepad ]]; then
				selected=$(echo "$REPLY - 1" | bc)
				break
			else
				echo "Invalid selection, please try again."
			fi
		done
	fi

	# Check if a gamepad was selected
	if [ -n "$selected" ]; then
		# Open the selected gamepad device
		trap 'echo "Interrupted. Back to menu..."' INT
		jstest "/dev/input/js$selected"
		trap - INT
		selectGamepad
	else
		exit
	fi
}
selectGamepad
