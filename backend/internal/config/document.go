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

package config

import (
	"bytes"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Document is a parsed YAML document that keeps its comments.
//
// Every mutation goes through the node tree rather than a struct round trip. That
// is the whole point: unmarshalling into a struct and marshalling back is what
// silently deleted an operator's comments and any key the panel did not model.
type Document struct {
	root *yaml.Node
	// created records whether the source file existed, so callers can tell a
	// fresh file from a parsed one.
	created bool
}

// ParseDocument parses YAML source. An empty source yields an empty mapping.
func ParseDocument(src []byte) (*Document, error) {
	trimmed := strings.TrimSpace(string(src))
	if trimmed == "" {
		return &Document{root: newMappingNode()}, nil
	}

	var root yaml.Node
	if err := yaml.Unmarshal(src, &root); err != nil {
		return nil, fmt.Errorf("parsing headscale config: %w", err)
	}

	// A YAML file always parses into a document node wrapping the real content.
	if root.Kind == yaml.DocumentNode {
		if len(root.Content) == 0 {
			return &Document{root: newMappingNode()}, nil
		}
		if root.Content[0].Kind != yaml.MappingNode {
			return nil, errors.New("headscale config must be a YAML mapping at the top level")
		}
		return &Document{root: root.Content[0]}, nil
	}

	if root.Kind != yaml.MappingNode {
		return nil, errors.New("headscale config must be a YAML mapping at the top level")
	}
	return &Document{root: &root}, nil
}

// NewDocument returns an empty document.
func NewDocument() *Document {
	return &Document{root: newMappingNode(), created: true}
}

func newMappingNode() *yaml.Node {
	return &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
}

// Bytes renders the document back to YAML.
//
// The indent is pinned to two spaces because that is what headscale's own example
// config uses; the encoder's four-space default would reindent every line of an
// operator's file and bury the actual change in noise.
//
// What survives a round trip: every comment yaml.v3 can attach to a node (head,
// line and foot comments), every unmodelled key, key order, and quoting style.
// What does not: blank lines between blocks, and runs of spaces before an inline
// comment. Both are whitespace-only, so no configured value is lost, but a file
// saved through the panel will look slightly tighter than one typed by hand.
func (d *Document) Bytes() ([]byte, error) {
	if d == nil || d.root == nil {
		return nil, errors.New("document is empty")
	}

	var buf bytes.Buffer
	encoder := yaml.NewEncoder(&buf)
	encoder.SetIndent(2)
	if err := encoder.Encode(d.root); err != nil {
		return nil, err
	}
	if err := encoder.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Clone deep-copies the document so a failed merge cannot corrupt the original.
func (d *Document) Clone() *Document {
	if d == nil || d.root == nil {
		return NewDocument()
	}
	return &Document{root: cloneNode(d.root), created: d.created}
}

func cloneNode(n *yaml.Node) *yaml.Node {
	if n == nil {
		return nil
	}
	out := *n
	if len(n.Content) > 0 {
		out.Content = make([]*yaml.Node, len(n.Content))
		for i, child := range n.Content {
			out.Content[i] = cloneNode(child)
		}
	}
	return &out
}

// Get returns the value at a dotted path.
//
// Values come back as plain Go types (string, bool, int, []string, map[string]any)
// so callers never have to reason about YAML nodes. A value that cannot be decoded
// reports as absent rather than as an error: callers treat "unreadable" and
// "missing" the same way, and an error return would force every caller to handle
// a case it cannot act on.
func (d *Document) Get(path string) (any, bool) {
	node := d.find(path)
	if node == nil {
		return nil, false
	}
	value, err := decodeNode(node)
	if err != nil {
		return nil, false
	}
	return value, true
}

// Set writes a value at a dotted path, creating intermediate mappings.
func (d *Document) Set(path string, value any) error {
	parts := strings.Split(path, ".")
	if len(parts) == 0 {
		return errors.New("empty path")
	}

	mapping := d.root
	for _, part := range parts[:len(parts)-1] {
		next := mappingValue(mapping, part)
		if next == nil {
			created := newMappingNode()
			mapping.Content = append(mapping.Content, scalarKey(part), created)
			mapping = created
			continue
		}
		if next.Kind != yaml.MappingNode {
			return fmt.Errorf("%q is not a mapping, cannot set %q below it", part, path)
		}
		mapping = next
	}

	leaf := parts[len(parts)-1]
	encoded, err := encodeValue(value)
	if err != nil {
		return fmt.Errorf("encoding %q: %w", path, err)
	}

	existing := mappingValue(mapping, leaf)
	if existing == nil {
		mapping.Content = append(mapping.Content, scalarKey(leaf), encoded)
		return nil
	}

	// Replace the value but keep the node so any comment attached to it survives.
	existing.Kind = encoded.Kind
	existing.Tag = encoded.Tag
	existing.Value = encoded.Value
	existing.Style = encoded.Style
	existing.Content = encoded.Content
	return nil
}

// Delete removes a key and, if it was the last one, its now-empty parent.
func (d *Document) Delete(path string) {
	parts := strings.Split(path, ".")
	mapping := d.root
	parents := []*yaml.Node{d.root}

	for _, part := range parts[:len(parts)-1] {
		next := mappingValue(mapping, part)
		if next == nil || next.Kind != yaml.MappingNode {
			return
		}
		mapping = next
		parents = append(parents, mapping)
	}

	leaf := parts[len(parts)-1]
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value != leaf {
			continue
		}
		mapping.Content = append(mapping.Content[:i], mapping.Content[i+2:]...)
		break
	}

	// Drop parents that became empty so a removed block does not leave `oidc: {}`
	// behind, which headscale would parse as an empty provider.
	for i := len(parents) - 1; i > 0; i-- {
		if len(parents[i].Content) == 0 {
			parent := parents[i-1]
			for j := 0; j+1 < len(parent.Content); j += 2 {
				if parent.Content[j+1] == parents[i] {
					parent.Content = append(parent.Content[:j], parent.Content[j+2:]...)
					break
				}
			}
		}
	}
}

// Keys returns the top-level keys currently present.
func (d *Document) Keys() []string {
	if d == nil || d.root == nil {
		return nil
	}
	out := make([]string, 0, len(d.root.Content)/2)
	for i := 0; i+1 < len(d.root.Content); i += 2 {
		out = append(out, d.root.Content[i].Value)
	}
	return out
}

// Has reports whether a dotted path exists.
func (d *Document) Has(path string) bool {
	return d.find(path) != nil
}

// AsMap flattens the document into dotted paths.
//
// Only leaves are emitted, so a caller comparing documents sees `dns.magic_dns`
// rather than `dns`. Sequence values stay whole: a list of nameservers is one
// value, not one per element.
func (d *Document) AsMap() map[string]any {
	out := map[string]any{}
	if d == nil || d.root == nil {
		return out
	}
	flatten(d.root, "", out)
	return out
}

func flatten(node *yaml.Node, prefix string, out map[string]any) {
	if node == nil {
		return
	}

	switch node.Kind {
	case yaml.MappingNode:
		if len(node.Content) == 0 {
			if prefix != "" {
				out[prefix] = map[string]any{}
			}
			return
		}
		for i := 0; i+1 < len(node.Content); i += 2 {
			key := node.Content[i].Value
			child := prefix + key
			if prefix != "" {
				child = prefix + "." + key
			}
			flatten(node.Content[i+1], child, out)
		}
	case yaml.SequenceNode:
		if prefix == "" {
			return
		}
		decoded, err := decodeNode(node)
		if err != nil {
			return
		}
		out[prefix] = decoded
	default:
		if prefix == "" {
			return
		}
		decoded, err := decodeNode(node)
		if err != nil {
			return
		}
		out[prefix] = decoded
	}
}

// find walks to the node at a dotted path.
func (d *Document) find(path string) *yaml.Node {
	if d == nil || d.root == nil || path == "" {
		return nil
	}

	mapping := d.root
	parts := strings.Split(path, ".")
	for i, part := range parts {
		if mapping.Kind != yaml.MappingNode {
			return nil
		}
		next := mappingValue(mapping, part)
		if next == nil {
			return nil
		}
		if i == len(parts)-1 {
			return next
		}
		mapping = next
	}
	return nil
}

// mappingValue returns the value node for a key.
func mappingValue(mapping *yaml.Node, key string) *yaml.Node {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

func scalarKey(key string) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key}
}

// decodeNode converts a node into a plain Go value.
func decodeNode(node *yaml.Node) (any, error) {
	switch node.Kind {
	case yaml.SequenceNode:
		out := make([]string, 0, len(node.Content))
		for _, item := range node.Content {
			if item.Kind != yaml.ScalarNode {
				var generic any
				if err := item.Decode(&generic); err != nil {
					return nil, err
				}
				out = append(out, fmt.Sprint(generic))
				continue
			}
			out = append(out, item.Value)
		}
		return out, nil

	case yaml.MappingNode:
		out := make(map[string]any, len(node.Content)/2)
		for i := 0; i+1 < len(node.Content); i += 2 {
			var value any
			if err := node.Content[i+1].Decode(&value); err != nil {
				return nil, err
			}
			out[node.Content[i].Value] = value
		}
		return out, nil

	default:
		switch node.Tag {
		case "!!bool":
			return strconv.ParseBool(node.Value)
		case "!!int":
			return strconv.Atoi(node.Value)
		case "!!null":
			return nil, nil
		default:
			return node.Value, nil
		}
	}
}

// encodeValue converts a plain Go value into a node.
func encodeValue(value any) (*yaml.Node, error) {
	switch typed := value.(type) {
	case nil:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"}, nil

	case string:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: typed}, nil

	case bool:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: strconv.FormatBool(typed)}, nil

	case int:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: strconv.Itoa(typed)}, nil

	case int64:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: strconv.FormatInt(typed, 10)}, nil

	case []string:
		node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
		for _, item := range typed {
			node.Content = append(node.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: item})
		}
		return node, nil

	case map[string]string:
		node := newMappingNode()
		for key, item := range typed {
			node.Content = append(node.Content,
				scalarKey(key),
				&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: item})
		}
		return node, nil

	case map[string][]string:
		node := newMappingNode()
		for key, items := range typed {
			child, err := encodeValue(items)
			if err != nil {
				return nil, err
			}
			node.Content = append(node.Content, scalarKey(key), child)
		}
		return node, nil

	default:
		// Fall back to reflection-free encoding for anything else a caller passes.
		var node yaml.Node
		if err := node.Encode(value); err != nil {
			return nil, err
		}
		return &node, nil
	}
}
