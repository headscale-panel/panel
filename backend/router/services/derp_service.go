// Copyright (C) 2026 
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"context"
	"fmt"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/unifyerror"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type derpService struct{}

var DERPService = new(derpService)

// DERPMapFile represents the DERP map YAML file structure
type DERPMapFile struct {
	Regions map[int]*DERPRegion `json:"regions" yaml:"regions"`
}

// DERPRegion represents a DERP region
type DERPRegion struct {
	RegionID   int        `json:"regionid" yaml:"regionid"`
	RegionCode string     `json:"regioncode" yaml:"regioncode"`
	RegionName string     `json:"regionname" yaml:"regionname"`
	Nodes      []DERPNode `json:"nodes" yaml:"nodes"`
}

// DERPNode represents a DERP node in a region
type DERPNode struct {
	Name     string `json:"name" yaml:"name"`
	RegionID int    `json:"regionid" yaml:"regionid"`
	HostName string `json:"hostname" yaml:"hostname"`
	IPv4     string `json:"ipv4" yaml:"ipv4,omitempty"`
	IPv6     string `json:"ipv6" yaml:"ipv6,omitempty"`
	STUNPort int    `json:"stunport" yaml:"stunport"`
	STUNOnly bool   `json:"stunonly" yaml:"stunonly"`
	DERPPort int    `json:"derpport" yaml:"derpport"`
}

// GetDERPMap reads the DERP map from the YAML file
func (s *derpService) GetDERPMap(actorUserID uint) (*DERPMapFile, error) {
	if err := RequirePermission(actorUserID, "headscale:derp:view"); err != nil {
		return nil, err
	}

	return s.getDERPMap()
}

func (s *derpService) getDERPMap() (*DERPMapFile, error) {
	data, err := os.ReadFile(constants.DERPMapFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return &DERPMapFile{
				Regions: make(map[int]*DERPRegion),
			}, nil
		}
		return nil, unifyerror.ServerError(err)
	}

	var derpMap DERPMapFile
	if err := yaml.Unmarshal(data, &derpMap); err != nil {
		return nil, unifyerror.ServerError(err)
	}

	if derpMap.Regions == nil {
		derpMap.Regions = make(map[int]*DERPRegion)
	}

	return &derpMap, nil
}

// SaveDERPMap writes the DERP map to the YAML file. When restart is true and
// DinD mode is enabled the Headscale container will be restarted afterward.
func (s *derpService) SaveDERPMap(actorUserID uint, derpMap *DERPMapFile, restart bool) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	if err := s.saveDERPMap(derpMap); err != nil {
		return err
	}
	if restart {
		headscale.TryRestartHeadscale(context.Background(), "derp map write")
	}
	return nil
}

func (s *derpService) saveDERPMap(derpMap *DERPMapFile) error {
	dir := filepath.Dir(constants.DERPMapFilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return unifyerror.ServerError(err)
	}

	data, err := yaml.Marshal(derpMap)
	if err != nil {
		return unifyerror.ServerError(err)
	}

	if err := os.WriteFile(constants.DERPMapFilePath, data, 0600); err != nil {
		return unifyerror.ServerError(err)
	}

	return nil
}

// AddRegion adds a new DERP region
func (s *derpService) AddRegion(actorUserID uint, region *DERPRegion) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	derpMap, err := s.getDERPMap()
	if err != nil {
		return err
	}

	if _, exists := derpMap.Regions[region.RegionID]; exists {
		return unifyerror.Conflict(fmt.Sprintf("region ID %d already exists", region.RegionID))
	}

	derpMap.Regions[region.RegionID] = region

	if err := s.saveDERPMap(derpMap); err != nil {
		return unifyerror.ServerError(err)
	}

	return nil
}

// UpdateRegion updates an existing DERP region
func (s *derpService) UpdateRegion(actorUserID uint, regionID int, region *DERPRegion) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	derpMap, err := s.getDERPMap()
	if err != nil {
		return err
	}

	if _, exists := derpMap.Regions[regionID]; !exists {
		return unifyerror.NotFound()
	}

	// If the region ID changed, remove the old entry
	if region.RegionID != regionID {
		delete(derpMap.Regions, regionID)
	}

	derpMap.Regions[region.RegionID] = region

	if err := s.saveDERPMap(derpMap); err != nil {
		return unifyerror.ServerError(err)
	}

	return nil
}

// DeleteRegion deletes a DERP region by its ID
func (s *derpService) DeleteRegion(actorUserID uint, regionID int) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	derpMap, err := s.getDERPMap()
	if err != nil {
		return err
	}

	if _, exists := derpMap.Regions[regionID]; !exists {
		return unifyerror.NotFound()
	}

	delete(derpMap.Regions, regionID)

	if err := s.saveDERPMap(derpMap); err != nil {
		return unifyerror.ServerError(err)
	}

	return nil
}

// AddNode adds a new node to a DERP region
func (s *derpService) AddNode(actorUserID uint, regionID int, node DERPNode) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	derpMap, err := s.getDERPMap()
	if err != nil {
		return err
	}

	region, exists := derpMap.Regions[regionID]
	if !exists {
		return unifyerror.NotFound()
	}

	node.RegionID = regionID
	region.Nodes = append(region.Nodes, node)

	if err := s.saveDERPMap(derpMap); err != nil {
		return unifyerror.ServerError(err)
	}

	return nil
}

// UpdateNode updates a node in a DERP region by its index
func (s *derpService) UpdateNode(actorUserID uint, regionID int, nodeIndex int, node DERPNode) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	derpMap, err := s.getDERPMap()
	if err != nil {
		return err
	}

	region, exists := derpMap.Regions[regionID]
	if !exists {
		return unifyerror.NotFound()
	}

	if nodeIndex < 0 || nodeIndex >= len(region.Nodes) {
		return unifyerror.WrongParam("node_index")
	}

	node.RegionID = regionID
	region.Nodes[nodeIndex] = node

	if err := s.saveDERPMap(derpMap); err != nil {
		return unifyerror.ServerError(err)
	}

	return nil
}

// DeleteNode deletes a node from a DERP region by its index
func (s *derpService) DeleteNode(actorUserID uint, regionID int, nodeIndex int) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	derpMap, err := s.getDERPMap()
	if err != nil {
		return err
	}

	region, exists := derpMap.Regions[regionID]
	if !exists {
		return unifyerror.NotFound()
	}

	if nodeIndex < 0 || nodeIndex >= len(region.Nodes) {
		return unifyerror.WrongParam("node_index")
	}

	region.Nodes = append(region.Nodes[:nodeIndex], region.Nodes[nodeIndex+1:]...)

	if err := s.saveDERPMap(derpMap); err != nil {
		return unifyerror.ServerError(err)
	}

	return nil
}
