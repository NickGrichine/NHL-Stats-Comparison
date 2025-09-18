let playerStats = [];
let radarChart;
let additionalPlayers = []; // Track additional players
let maxPlayers = 4; // Maximum total players allowed

// NHL team abbreviation to full name mapping
const TEAM_FULL_NAMES = {
    "ANA": "Anaheim Ducks",
    "ARI": "Arizona Coyotes",
    "UTA": "Utah Hockey Club",
    "BOS": "Boston Bruins",
    "BUF": "Buffalo Sabres",
    "CGY": "Calgary Flames",
    "CAR": "Carolina Hurricanes",
    "CHI": "Chicago Blackhawks",
    "COL": "Colorado Avalanche",
    "CBJ": "Columbus Blue Jackets",
    "DAL": "Dallas Stars",
    "DET": "Detroit Red Wings",
    "EDM": "Edmonton Oilers",
    "FLA": "Florida Panthers",
    "LAK": "Los Angeles Kings",
    "MIN": "Minnesota Wild",
    "MTL": "Montreal Canadiens",
    "NSH": "Nashville Predators",
    "NJD": "New Jersey Devils",
    "NYI": "New York Islanders",
    "NYR": "New York Rangers",
    "OTT": "Ottawa Senators",
    "PHI": "Philadelphia Flyers",
    "PIT": "Pittsburgh Penguins",
    "SEA": "Seattle Kraken",
    "SJS": "San Jose Sharks",
    "STL": "St. Louis Blues",
    "TBL": "Tampa Bay Lightning",
    "TOR": "Toronto Maple Leafs",
    "VAN": "Vancouver Canucks",
    "VGK": "Vegas Golden Knights",
    "WSH": "Washington Capitals",
    "WPG": "Winnipeg Jets"
};

function formatFullTeamNames(teamField) {
    if (!teamField || teamField === "-") return "";
    const cleaned = String(teamField).replace(/\"/g, "").trim();
    // Split on commas and/or spaces
    const codes = cleaned.split(/[, ]+/).map(c => c.trim()).filter(Boolean);
    const mapped = codes.map(code => TEAM_FULL_NAMES[code] || code);
    // De-duplicate while preserving order
    const seen = new Set();
    const unique = mapped.filter(name => (seen.has(name) ? false : (seen.add(name), true)));
    return unique.join(', ');
}

// Player position abbreviation to full name mapping
const POS_FULL_NAMES = {
    "C": "Center",
    "L": "Left Wing",
    "R": "Right Wing",
    "LW": "Left Wing",
    "RW": "Right Wing",
    "D": "Defenseman",
    "LD": "Left Defenseman",
    "RD": "Right Defenseman"
};

function formatFullPositions(posField) {
    if (!posField || posField === "-") return "";
    const cleaned = String(posField).replace(/\"/g, "").trim();
    // Split on slashes, commas, or spaces (e.g., "C/R" -> ["C","R"])
    const parts = cleaned.split(/[\/ ,]+/).map(p => p.trim()).filter(Boolean);
    const mapped = parts.map(p => POS_FULL_NAMES[p] || p);
    const seen = new Set();
    const unique = mapped.filter(name => (seen.has(name) ? false : (seen.add(name), true)));
    return unique.join(', ');
}

Papa.parse("regular-season-skaters.csv", {
    download: true,
    header: true,
    complete: function(results) {
        playerStats = results.data;

        const dropdown1 = document.getElementById("dropdown1");
        const dropdown2 = document.getElementById("dropdown2");

        // Clear existing options first
        dropdown1.innerHTML = '';
        dropdown2.innerHTML = '';

        // Add options for top 100 players
        playerStats.slice(0, 100).forEach((player, index) => {
            if (player["Player"]) {
                // Add to dropdown with numbering
                const dropdownItem1 = document.createElement("div");
                dropdownItem1.className = "dropdown-item";
                dropdownItem1.textContent = `${index + 1}. ${player["Player"]}`;
                dropdownItem1.onclick = function() {
                    document.getElementById("player1").value = player["Player"];
                    dropdown1.classList.remove("show");
                    updateChart();
                    updatePlayerTable();
                };
                dropdown1.appendChild(dropdownItem1);

                const dropdownItem2 = document.createElement("div");
                dropdownItem2.className = "dropdown-item";
                dropdownItem2.textContent = `${index + 1}. ${player["Player"]}`;
                dropdownItem2.onclick = function() {
                    document.getElementById("player2").value = player["Player"];
                    dropdown2.classList.remove("show");
                    updateChart();
                    updatePlayerTable();
                };
                dropdown2.appendChild(dropdownItem2);
            }
        });



        // Auto-fill first 2 players
        document.getElementById("player1").value = playerStats[0]["Player"];
        document.getElementById("player2").value = playerStats[1]["Player"];
        updateChart();
        updateTableStructure();
        updatePlayerTable();
        
        // Initialize add button state
        updateAddButtonState();
        

    }
});



function getPlayerData(name) {
    const player = playerStats.find(p => p["Player"].toLowerCase() === name.toLowerCase());
    if (!player) return [];

    // Get raw values
    const rawValues = [
        parseFloat(player["P"]),      // Points
        parseFloat(player["G"]),      // Goals
        parseFloat(player["A"]),      // Assists
        parseFloat(player["+/-"]),    // Plus/Minus
        parseFloat(player["P/GP"]),   // Points Per Game
        parseFloat(player["EVP"]),    // Even Strength Points
        parseFloat(player["PPP"]),    // Power Play Points
        parseFloat(player["PIM"])     // Penalty Minutes
    ];

    // Define appropriate caps for each statistic
    const statCaps = [130, 60, 90, 80, 2.0, 90, 50, 70];
    
    // Normalize values to 0-130 scale with appropriate caps for each stat
    return rawValues.map((value, index) => {
        if (isNaN(value)) return 0;
        
        const cap = statCaps[index];
        
        // For +/- stat, normalize from -40 to +40 range to 0-130
        if (index === 3) { // +/- stat
            const normalized = ((value + 40) / 80) * 130;
            return Math.max(0, Math.min(130, normalized));
        }
        
        // For other stats, normalize to 0-130 scale based on their cap
        const normalized = (value / cap) * 130;
        return Math.max(0, Math.min(130, normalized));
    });
}

function updateChart() {
    const p1 = document.getElementById("player1").value;
    const p2 = document.getElementById("player2").value;

    if (!p1 || !p2) return; // wait until both are filled

    const data1 = getPlayerData(p1);
    const data2 = getPlayerData(p2);

    if (data1.length === 0 || data2.length === 0) return; // invalid player names

    // Get additional players data
    const additionalDatasets = [];
    additionalPlayers.forEach(player => {
        const playerData = getPlayerData(player.input.value);
        if (playerData.length > 0) {
            additionalDatasets.push({
                label: player.input.value,
                data: playerData,
                backgroundColor: player.number === 3 ? 'rgba(40, 167, 69, 0.2)' : 'rgba(255, 193, 7, 0.2)',
                borderColor: player.number === 3 ? 'rgb(40, 167, 69)' : 'rgb(255, 193, 7)',
                borderWidth: 2
            });
        }
    });

    const ctx = document.getElementById("radarChart").getContext("2d");

    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: [
                { label: 'P', full: 'Points' },
                { label: 'G', full: 'Goals' },
                { label: 'A', full: 'Assists' },
                { label: '+/-', full: 'Plus/Minus' },
                { label: 'P/GP', full: 'Points Per Game' },
                { label: 'EVP', full: 'Even Strength Points' },
                { label: 'PPP', full: 'Power Play Points' },
                { label: 'PIM', full: 'Penalty Minutes' }
            ],
            datasets: [
                {
                    label: p1,
                    data: data1,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 2
                },
                {
                    label: p2,
                    data: data2,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgb(255, 99, 132)',
                    borderWidth: 2
                },
                ...additionalDatasets
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 130,
                    ticks: {
                        display: false
                    },
                    pointLabels: {
                        callback: function(value, index) {
                            // Show abbreviation on the chart
                            return this.chart.data.labels[index].label;
                        },
                        font: {
                            size: 12
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            // When hovering, show full stat name in tooltip
                            const labelObj = context[0].chart.data.labels[context[0].dataIndex];
                            return labelObj.full || labelObj.label;
                        },
                        label: function(context) {
                            // Show actual player values in tooltip
                            const playerName = context.dataset.label;
                            const player = playerStats.find(p => p["Player"].toLowerCase() === playerName.toLowerCase());
                            if (!player) return context.formattedValue;
                            
                            const statIndex = context.dataIndex;
                            const statNames = ["P", "G", "A", "+/-", "P/GP", "EVP", "PPP", "PIM"];
                            const actualValue = player[statNames[statIndex]];
                            
                            return `${playerName}: ${actualValue}`;
                        }
                    }
                }
            }
        }
    });
    
    // Add tooltip functionality for radar chart axis labels
    addRadarChartTooltips();
}

// Add tooltip functionality for radar chart axis labels
function addRadarChartTooltips() {
    const canvas = document.getElementById("radarChart");
    const tooltip = document.getElementById("radarTooltip");
    
    if (!canvas || !tooltip || !radarChart) return;
    
    const scale = () => radarChart && radarChart.scales && radarChart.scales.r;
    const getLabelText = (i) => {
        const lbl = radarChart.data.labels[i];
        return typeof lbl === 'object' && lbl.full ? lbl.full : (lbl.label || lbl);
    };
    
    let showTimer;
    const onMove = function(e) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const mouseX = (e.clientX - rect.left) * dpr;
        const mouseY = (e.clientY - rect.top) * dpr;
        
        const s = scale();
        if (!s) return tooltip.classList.remove('show');
        
        const count = radarChart.data.labels.length;
        let nearestIndex = -1;
        let nearestDistSq = Infinity;
        
        for (let i = 0; i < count; i++) {
            let pos;
            if (typeof s.getPointLabelPosition === 'function') {
                pos = s.getPointLabelPosition(i);
            } else {
                const angle = (s.getIndexAngle ? s.getIndexAngle(i) : (i * (2 * Math.PI / count) - Math.PI / 2));
                const cx = s.xCenter !== undefined ? s.xCenter : (radarChart.chartArea.left + radarChart.chartArea.right) / 2;
                const cy = s.yCenter !== undefined ? s.yCenter : (radarChart.chartArea.top + radarChart.chartArea.bottom) / 2;
                const r = (s.drawingArea || Math.min(radarChart.width, radarChart.height) / 2) + 10;
                pos = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
            }
            const dx = mouseX - pos.x;
            const dy = mouseY - pos.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestIndex = i;
            }
        }
        
        // Threshold in device pixels squared
        const threshold = 20 * (window.devicePixelRatio || 1);
        if (nearestIndex !== -1 && nearestDistSq < threshold * threshold) {
            const text = getLabelText(nearestIndex);
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY - 10) + 'px';
            clearTimeout(showTimer);
            showTimer = setTimeout(() => {
                tooltip.textContent = text;
                tooltip.classList.add('show');
            }, 400);
        } else {
            clearTimeout(showTimer);
            tooltip.classList.remove('show');
        }
    };
    
    // Remove any prior listeners to avoid duplicates when chart re-renders
    canvas.removeEventListener('mousemove', canvas._radarMoveHandler);
    canvas.removeEventListener('mouseleave', canvas._radarLeaveHandler);
    
    canvas._radarMoveHandler = onMove;
    canvas._radarLeaveHandler = function() { tooltip.classList.remove('show'); };
    
    canvas.addEventListener('mousemove', canvas._radarMoveHandler);
    canvas.addEventListener('mouseleave', canvas._radarLeaveHandler);
}

// Live update when typing in search
document.getElementById("player1").addEventListener("input", function() {
    updateChart();
    updatePlayerTable();
    if (this.value.length > 0) {
        filterAndShowDropdown('player1', this.value);
    } else {
        document.getElementById("dropdown1").classList.remove("show");
    }
});
document.getElementById("player2").addEventListener("input", function() {
    updateChart();
    updatePlayerTable();
    if (this.value.length > 0) {
        filterAndShowDropdown('player2', this.value);
    } else {
        document.getElementById("dropdown2").classList.remove("show");
    }
});

// Close dropdowns when clicking outside
document.addEventListener("click", function(event) {
    if (!event.target.closest(".autocomplete-container")) {
        // Close all dropdowns
        const allDropdowns = document.querySelectorAll('.dropdown-menu');
        allDropdowns.forEach(dd => {
            dd.classList.remove("show");
        });
    }
});

// Dropdown toggle function
function toggleDropdown(playerId) {
    // Extract the player number from the playerId
    const playerNumber = playerId.replace('player', '');
    const dropdown = document.getElementById(`dropdown${playerNumber}`);
    
    if (!dropdown) {
        return;
    }
    
    // Close all other dropdowns
    const allDropdowns = document.querySelectorAll('.dropdown-menu');
    allDropdowns.forEach(dd => {
        if (dd !== dropdown) {
            dd.classList.remove("show");
        }
    });
    
    // Toggle current dropdown
    dropdown.classList.toggle("show");
    
    // If opening dropdown, show all items (reset filter)
    if (dropdown.classList.contains("show")) {
        const items = dropdown.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            item.style.display = 'block';
        });
    }
}

// Filter and show dropdown based on search input
function filterAndShowDropdown(playerId, searchTerm) {
    // Extract the player number from the playerId
    const playerNumber = playerId.replace('player', '');
    const dropdown = document.getElementById(`dropdown${playerNumber}`);
    
    if (!dropdown) {
        return;
    }
    
    const items = dropdown.querySelectorAll('.dropdown-item');
    let hasMatches = false;
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const search = searchTerm.toLowerCase();
        
        if (text.includes(search)) {
            item.style.display = 'block';
            hasMatches = true;
        } else {
            item.style.display = 'none';
        }
    });
    
    // Show dropdown if there are matches
    if (hasMatches) {
        dropdown.classList.add("show");
    } else {
        dropdown.classList.remove("show");
    }
}

// Add a new player
function addPlayer() {
    if (additionalPlayers.length >= 2) {
        return; // Already at max
    }
    
    // Find the next available slot (3 or 4)
    let nextSlot = 3;
    if (additionalPlayers.length > 0) {
        nextSlot = additionalPlayers[0].number === 3 ? 4 : 3;
    }
    
    const additionalPlayersContainer = document.getElementById("additional-players");
    
    // Create player input group
    const playerGroup = document.createElement("div");
    playerGroup.className = "player-input-group";
    playerGroup.id = `player${nextSlot}-group`;
    
    // Create label
    const label = document.createElement("label");
    label.textContent = `Player ${nextSlot}:`;
    label.setAttribute("for", `player${nextSlot}`);
    
    // Create autocomplete container
    const autocompleteContainer = document.createElement("div");
    autocompleteContainer.className = "autocomplete-container";
    
    // Create input
    const input = document.createElement("input");
    input.type = "text";
    input.id = `player${nextSlot}`;
    input.placeholder = "Type to search or click arrow...";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    
    // Create dropdown arrow
    const dropdownArrow = document.createElement("button");
    dropdownArrow.type = "button";
    dropdownArrow.className = "dropdown-arrow";
    dropdownArrow.textContent = "▼";
    dropdownArrow.onclick = function() {
        toggleDropdown(`player${nextSlot}`);
    };
    
    // Create dropdown menu for this player
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown-menu";
    dropdown.id = `dropdown${nextSlot}`;
    dropdown.style.display = "none";
    
    // Populate dropdown with top 100 players
    playerStats.slice(0, 100).forEach((player, index) => {
        if (player["Player"]) {
            const dropdownItem = document.createElement("div");
            dropdownItem.className = "dropdown-item";
            dropdownItem.textContent = `${index + 1}. ${player["Player"]}`;
            dropdownItem.onclick = function() {
                input.value = player["Player"];
                dropdown.classList.remove("show");
                updateChart();
                updatePlayerTable();
            };
            dropdown.appendChild(dropdownItem);
        }
    });
    
    // Append elements
    autocompleteContainer.appendChild(input);
    autocompleteContainer.appendChild(dropdownArrow);
    autocompleteContainer.appendChild(dropdown);
    
    // Ensure dropdown is positioned correctly
    autocompleteContainer.style.position = "relative";
    
    
    
    playerGroup.appendChild(label);
    playerGroup.appendChild(autocompleteContainer);
    
    // Add remove button
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-player-btn";
    removeBtn.textContent = "×";
    removeBtn.onclick = function() {
        removePlayer(nextSlot);
    };
    
    playerGroup.appendChild(removeBtn);
    
    // Add to container
    additionalPlayersContainer.appendChild(playerGroup);
    
    // Add event listener for input (debounced to avoid constant chart updates)
    let timeoutId;
    input.addEventListener("input", function() {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            if (this.value.length > 0) {
                filterAndShowDropdown(`player${nextSlot}`, this.value);
            } else {
                dropdown.classList.remove("show");
            }
        }, 300); // 300ms delay
    });
    
    
    
    // Add to tracking array
    additionalPlayers.push({
        number: nextSlot,
        element: playerGroup,
        input: input,
        dropdown: dropdown
    });
    
    // Update + button state
    updateAddButtonState();
    
    // Update chart and table
    updateChart();
    updateTableStructure();
    updatePlayerTable();
}

// Remove a player
function removePlayer(playerNumber) {
    const playerIndex = additionalPlayers.findIndex(p => p.number === playerNumber);
    if (playerIndex === -1) return;
    
    const player = additionalPlayers[playerIndex];
    
    // Remove from DOM
    player.element.remove();
    
    // Remove from tracking array
    additionalPlayers.splice(playerIndex, 1);
    
    // Renumber remaining players to maintain sequential order
    additionalPlayers.forEach((p, index) => {
        const newNumber = index + 3;
        if (p.number !== newNumber) {
            // Update the player number
            p.number = newNumber;
            
            // Update the label
            const label = p.element.querySelector('label');
            label.textContent = `Player ${newNumber}:`;
            label.setAttribute("for", `player${newNumber}`);
            
            // Update the input ID
            p.input.id = `player${newNumber}`;
            
            // Update the dropdown ID
            p.dropdown.id = `dropdown${newNumber}`;
            
            // Update the group ID
            p.element.id = `player${newNumber}-group`;
            
            // Update the remove button onclick
            const removeBtn = p.element.querySelector('.remove-player-btn');
            removeBtn.onclick = function() {
                removePlayer(newNumber);
            };
            
            // Update the dropdown arrow onclick
            const dropdownArrow = p.element.querySelector('.dropdown-arrow');
            dropdownArrow.onclick = function() {
                toggleDropdown(`player${newNumber}`);
            };
            
            // Update the input event listener
            p.input.removeEventListener('input', p.input._inputHandler);
            p.input._inputHandler = function() {
                let timeoutId;
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    if (this.value.length > 0) {
                        filterAndShowDropdown(`player${newNumber}`, this.value);
                    } else {
                        p.dropdown.classList.remove("show");
                    }
                }, 300);
            };
            p.input.addEventListener('input', p.input._inputHandler);
        }
    });
    
    // Update chart and table
    updateChart();
    updateTableStructure();
    updatePlayerTable();
    
    // Update + button state
    updateAddButtonState();
}

// Update add button state
function updateAddButtonState() {
    const addBtn = document.getElementById("addPlayerBtn");
    if (additionalPlayers.length >= 2) {
        addBtn.disabled = true;
    } else {
        addBtn.disabled = false;
    }
}

// Update table headers with current player names
function updateTableHeaders() {
    const table = document.getElementById("playerTable");
    const thead = table.querySelector("thead tr");
    
    // Remove existing player columns (keep stat column)
    while (thead.children.length > 1) {
        thead.removeChild(thead.lastChild);
    }
    
    // Add Player 1 and Player 2 columns with actual names
    const p1 = document.getElementById("player1").value;
    const p2 = document.getElementById("player2").value;
    
    const player1Header = document.createElement("th");
    player1Header.textContent = p1 || "Player 1";
    thead.appendChild(player1Header);
    
    const player2Header = document.createElement("th");
    player2Header.textContent = p2 || "Player 2";
    thead.appendChild(player2Header);
    
    // Add additional player columns with actual names
    additionalPlayers.forEach(player => {
        const playerHeader = document.createElement("th");
        playerHeader.textContent = player.input.value || `Player ${player.number}`;
        thead.appendChild(playerHeader);
    });
}

// Update player table with current player data
function updatePlayerTable() {
    const p1 = document.getElementById("player1").value;
    const p2 = document.getElementById("player2").value;
    
    if (!p1 || !p2) return;
    
    // Get player data
    const player1 = playerStats.find(p => p["Player"].toLowerCase() === p1.toLowerCase());
    const player2 = playerStats.find(p => p["Player"].toLowerCase() === p2.toLowerCase());
    
    if (!player1 || !player2) return;
    
    // Update table headers first
    updateTableHeaders();
    
    // Update Player 1 and Player 2 columns
    updateTableColumn(1, player1);
    updateTableColumn(2, player2);
    
    // Update additional players columns
    additionalPlayers.forEach(player => {
        const playerData = playerStats.find(p => p["Player"].toLowerCase() === player.input.value.toLowerCase());
        if (playerData) {
            updateTableColumn(player.number, playerData);
        }
    });
}

// Update a specific column in the table
function updateTableColumn(playerNumber, playerData) {
    const stats = ["Team", "Pos", "GP", "P", "G", "A", "+/-", "P/GP", "EVP", "PPP", "PIM"];
    
    console.log(`Updating table column for Player ${playerNumber}:`, playerData);
    
    stats.forEach(stat => {
        const cellId = `p${playerNumber}-${stat}`;
        const cell = document.getElementById(cellId);
        if (cell) {
            let value = playerData[stat];
            if (value === undefined || value === null || value === "") {
                value = "-";
            }
            cell.textContent = value;
            if (stat === "Team") {
                const full = formatFullTeamNames(value);
                cell.title = full || "";
            } else if (stat === "Pos") {
                const full = formatFullPositions(value);
                cell.title = full || "";
            } else {
                cell.removeAttribute('title');
            }
            console.log(`Updated cell ${cellId} with value: ${value}`);
        } else {
            console.log(`Cell not found: ${cellId}`);
        }
    });
}

// Update table structure (add/remove columns) based on number of players
function updateTableStructure() {
    const table = document.getElementById("playerTable");
    const thead = table.querySelector("thead tr");
    const tbody = table.querySelector("tbody");
    
    // Remove existing player columns (keep stat column)
    while (thead.children.length > 1) {
        thead.removeChild(thead.lastChild);
    }
    while (tbody.children.length > 0) {
        tbody.removeChild(tbody.lastChild);
    }
    
    // Add Player 1 and Player 2 columns with actual names
    const p1 = document.getElementById("player1").value;
    const p2 = document.getElementById("player2").value;
    
    const player1Header = document.createElement("th");
    player1Header.textContent = p1 || "Player 1";
    thead.appendChild(player1Header);
    
    const player2Header = document.createElement("th");
    player2Header.textContent = p2 || "Player 2";
    thead.appendChild(player2Header);
    
    // Add additional player columns with actual names
    additionalPlayers.forEach(player => {
        const playerHeader = document.createElement("th");
        playerHeader.textContent = player.input.value || `Player ${player.number}`;
        thead.appendChild(playerHeader);
    });
    
    // Recreate table body with all stats including Team, Position, GP
    const statNames = ["Team", "Pos", "GP", "P", "G", "A", "+/-", "P/GP", "EVP", "PPP", "PIM"];
    const statIds = ["Team", "Pos", "GP", "P", "G", "A", "+/-", "P/GP", "EVP", "PPP", "PIM"];
    const statTooltips = ["Teams Played For", "Position", "Games Played", "Points", "Goals", "Assists", "Plus/Minus", "Points Per Game", "Even Strength Points", "Power Play Points", "Penalty Minutes"];
    
    statNames.forEach((statName, index) => {
        const row = document.createElement("tr");
        
        // Add stat name with tooltip
        const statCell = document.createElement("td");
        statCell.textContent = statName;
        statCell.title = statTooltips[index];
        statCell.className = "stat-label";
        row.appendChild(statCell);
        
        // Add Player 1 cell
        const p1Cell = document.createElement("td");
        p1Cell.id = `p1-${statIds[index]}`;
        p1Cell.textContent = "-";
        row.appendChild(p1Cell);
        
        // Add Player 2 cell
        const p2Cell = document.createElement("td");
        p2Cell.id = `p2-${statIds[index]}`;
        p2Cell.textContent = "-";
        row.appendChild(p2Cell);
        
        // Add additional player cells
        additionalPlayers.forEach(player => {
            const playerCell = document.createElement("td");
            playerCell.id = `p${player.number}-${statIds[index]}`;
            playerCell.textContent = "-";
            row.appendChild(playerCell);
        });
        
        tbody.appendChild(row);
    });
    
    // Debug: log the created cells
    console.log("Table structure updated. Created cells:");
    additionalPlayers.forEach(player => {
        console.log(`Player ${player.number} cells:`, tbody.querySelectorAll(`[id^="p${player.number}-"]`));
    });
}