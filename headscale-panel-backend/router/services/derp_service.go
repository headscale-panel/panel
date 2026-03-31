package services

import (
	"fmt"
	"headscale-panel/pkg/conf"
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
	filePath := s.getDERPMapPath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return &DERPMapFile{
				Regions: make(map[int]*DERPRegion),
			}, nil
		}
		return nil, fmt.Errorf("读取 DERP map 文件失败: %w", err)
	}

	var derpMap DERPMapFile
	if err := yaml.Unmarshal(data, &derpMap); err != nil {
		return nil, fmt.Errorf("DERP map YAML 解析失败: %w", err)
	}

	if derpMap.Regions == nil {
		derpMap.Regions = make(map[int]*DERPRegion)
	}

	return &derpMap, nil
}

// SaveDERPMap writes the DERP map to the YAML file
func (s *derpService) SaveDERPMap(actorUserID uint, derpMap *DERPMapFile) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	return s.saveDERPMap(derpMap)
}

func (s *derpService) saveDERPMap(derpMap *DERPMapFile) error {
	filePath := s.getDERPMapPath()

	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	data, err := yaml.Marshal(derpMap)
	if err != nil {
		return fmt.Errorf("DERP map YAML 序列化失败: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0600); err != nil {
		return fmt.Errorf("写入 DERP map 文件失败: %w", err)
	}

	return nil
}

// getDERPMapPath returns the path to the DERP map YAML file
func (s *derpService) getDERPMapPath() string {
	// Try to read from headscale config's derp.paths[0]
	hsConfig, err := HeadscaleConfigService.GetConfig()
	if err == nil && len(hsConfig.DERP.Paths) > 0 {
		return hsConfig.DERP.Paths[0]
	}

	// Fall back to configured path or default
	if conf.Conf.Headscale.ConfigPath != "" {
		dir := filepath.Dir(conf.Conf.Headscale.ConfigPath)
		return filepath.Join(dir, "derp-custom.yaml")
	}

	return "./headscale/derp-custom.yaml"
}

// AddRegion adds a new DERP region
func (s *derpService) AddRegion(actorUserID uint, region *DERPRegion) error {
	if err := RequirePermission(actorUserID, "headscale:derp:update"); err != nil {
		return err
	}

	derpMap, err := s.getDERPMap()
	if err != nil {
		return fmt.Errorf("读取 DERP map 失败: %w", err)
	}

	if _, exists := derpMap.Regions[region.RegionID]; exists {
		return fmt.Errorf("区域 ID %d 已存在", region.RegionID)
	}

	derpMap.Regions[region.RegionID] = region

	if err := s.saveDERPMap(derpMap); err != nil {
		return fmt.Errorf("保存 DERP map 失败: %w", err)
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
		return fmt.Errorf("读取 DERP map 失败: %w", err)
	}

	if _, exists := derpMap.Regions[regionID]; !exists {
		return fmt.Errorf("区域 ID %d 不存在", regionID)
	}

	// If the region ID changed, remove the old entry
	if region.RegionID != regionID {
		delete(derpMap.Regions, regionID)
	}

	derpMap.Regions[region.RegionID] = region

	if err := s.saveDERPMap(derpMap); err != nil {
		return fmt.Errorf("保存 DERP map 失败: %w", err)
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
		return fmt.Errorf("读取 DERP map 失败: %w", err)
	}

	if _, exists := derpMap.Regions[regionID]; !exists {
		return fmt.Errorf("区域 ID %d 不存在", regionID)
	}

	delete(derpMap.Regions, regionID)

	if err := s.saveDERPMap(derpMap); err != nil {
		return fmt.Errorf("保存 DERP map 失败: %w", err)
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
		return fmt.Errorf("读取 DERP map 失败: %w", err)
	}

	region, exists := derpMap.Regions[regionID]
	if !exists {
		return fmt.Errorf("区域 ID %d 不存在", regionID)
	}

	node.RegionID = regionID
	region.Nodes = append(region.Nodes, node)

	if err := s.saveDERPMap(derpMap); err != nil {
		return fmt.Errorf("保存 DERP map 失败: %w", err)
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
		return fmt.Errorf("读取 DERP map 失败: %w", err)
	}

	region, exists := derpMap.Regions[regionID]
	if !exists {
		return fmt.Errorf("区域 ID %d 不存在", regionID)
	}

	if nodeIndex < 0 || nodeIndex >= len(region.Nodes) {
		return fmt.Errorf("节点索引 %d 超出范围（共 %d 个节点）", nodeIndex, len(region.Nodes))
	}

	node.RegionID = regionID
	region.Nodes[nodeIndex] = node

	if err := s.saveDERPMap(derpMap); err != nil {
		return fmt.Errorf("保存 DERP map 失败: %w", err)
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
		return fmt.Errorf("读取 DERP map 失败: %w", err)
	}

	region, exists := derpMap.Regions[regionID]
	if !exists {
		return fmt.Errorf("区域 ID %d 不存在", regionID)
	}

	if nodeIndex < 0 || nodeIndex >= len(region.Nodes) {
		return fmt.Errorf("节点索引 %d 超出范围（共 %d 个节点）", nodeIndex, len(region.Nodes))
	}

	region.Nodes = append(region.Nodes[:nodeIndex], region.Nodes[nodeIndex+1:]...)

	if err := s.saveDERPMap(derpMap); err != nil {
		return fmt.Errorf("保存 DERP map 失败: %w", err)
	}

	return nil
}
