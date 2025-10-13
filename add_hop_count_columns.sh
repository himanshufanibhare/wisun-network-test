#!/bin/bash
# Script to add hop count column to all test templates

echo "Adding hop count column to all test templates..."

# Update RSSI test template
sed -i 's/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>\n                                <th><i class="fas fa-route me-1"><\/i>Hop Count<\/th>/' /home/wisun/wisun-codes/network-test-webapp/templates/rssi_test.html

# Update RPL test template  
sed -i 's/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>\n                                <th><i class="fas fa-route me-1"><\/i>Hop Count<\/th>/' /home/wisun/wisun-codes/network-test-webapp/templates/rpl_test.html

# Update disconnections test template
sed -i 's/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>\n                                <th><i class="fas fa-route me-1"><\/i>Hop Count<\/th>/' /home/wisun/wisun-codes/network-test-webapp/templates/disconnections_test.html

# Update availability test template  
sed -i 's/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>/<th><i class="fas fa-globe me-1"><\/i>IP Address<\/th>\n                                <th><i class="fas fa-route me-1"><\/i>Hop Count<\/th>/' /home/wisun/wisun-codes/network-test-webapp/templates/availability_test.html

echo "Hop count columns added to all test templates!"