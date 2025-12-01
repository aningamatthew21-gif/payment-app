// FlexibleVendorInput - A flexible vendor input component that allows both selection and new input
// This component replaces the restrictive <select> dropdown with a more user-friendly input

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, X, Plus, Check } from 'lucide-react';

const FlexibleVendorInput = ({
  value = '',
  onChange,
  onNewVendor,
  options = [],
  placeholder = 'Select or type vendor name...',
  disabled = false,
  className = '',
  allowNew = true,
  maxSuggestions = 8,
  validationService = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [filteredOptions, setFilteredOptions] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isTyping, setIsTyping] = useState(false);
  const [showNewVendorOption, setShowNewVendorOption] = useState(false);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const optionsRef = useRef(null);

  // Update input value when external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter options based on input value
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredOptions(options.slice(0, maxSuggestions));
      setShowNewVendorOption(false);
      return;
    }

    const searchTerm = inputValue.toLowerCase().trim();

    // Filter existing options
    const filtered = options
      .filter(option =>
        option.value.toLowerCase().includes(searchTerm) &&
        option.isActive !== false
      )
      .sort((a, b) => {
        // Prioritize exact matches and matches at the beginning
        const aStartsWith = a.value.toLowerCase().startsWith(searchTerm);
        const bStartsWith = b.value.toLowerCase().startsWith(searchTerm);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // Then sort by length (shorter names first)
        return a.value.length - b.value.length;
      })
      .slice(0, maxSuggestions);

    setFilteredOptions(filtered);

    // Show "Add new vendor" option if input doesn't match any existing vendor
    if (allowNew && inputValue.trim()) {
      const exactMatch = options.find(option =>
        option.value.toLowerCase() === searchTerm
      );
      setShowNewVendorOption(!exactMatch);
    } else {
      setShowNewVendorOption(false);
    }
  }, [inputValue, options, maxSuggestions, allowNew]);

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsTyping(true);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // Call onChange with the new value
    onChange(newValue);
  };

  // Handle option selection
  const handleOptionSelect = (option) => {
    setInputValue(option.value);
    setIsOpen(false);
    setIsTyping(false);
    setHighlightedIndex(-1);

    // Call onChange with the selected value
    onChange(option.value);

    // Update vendor usage if validation service is available
    if (validationService && typeof validationService.updateVendorUsage === 'function') {
      validationService.updateVendorUsage(option.value);
    }
  };

  // Handle new vendor creation
  const handleNewVendor = () => {
    const newVendorName = inputValue.trim();
    if (newVendorName && onNewVendor) {
      onNewVendor(newVendorName);
      setInputValue(newVendorName);
      setIsOpen(false);
      setIsTyping(false);
      setHighlightedIndex(-1);

      // Call onChange with the new vendor name
      onChange(newVendorName);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleOptionSelect(filteredOptions[highlightedIndex]);
      } else if (inputValue.trim()) {
        // Check if it matches an existing option exactly
        const exactMatch = options.find(opt => opt.value.toLowerCase() === inputValue.trim().toLowerCase());
        if (exactMatch) {
          handleOptionSelect(exactMatch);
        } else if (allowNew) {
          handleNewVendor();
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = Math.min(highlightedIndex + 1, filteredOptions.length - 1 + (showNewVendorOption ? 1 : 0));
      setHighlightedIndex(nextIndex);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(highlightedIndex - 1, -1);
      setHighlightedIndex(prevIndex);
      return;
    }

    if (e.key === 'Tab') {
      // Auto-select or add on tab
      if (inputValue.trim()) {
        const exactMatch = options.find(opt => opt.value.toLowerCase() === inputValue.trim().toLowerCase());
        if (exactMatch) {
          handleOptionSelect(exactMatch);
        } else if (allowNew && !options.find(opt => opt.value === inputValue.trim())) {
          handleNewVendor();
        }
      }
      setIsOpen(false);
    }
  };

  // Handle focus events
  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const handleBlur = () => {
    // Delay closing to allow for option selection
    setTimeout(() => {
      // Auto-add on blur if it's a new value and not empty
      if (allowNew && inputValue.trim() && !options.find(opt => opt.value === inputValue.trim())) {
        // Only add if we're not just closing the dropdown after a selection
        // The timeout helps, but we should check if the input value is still the same
        // and if it hasn't been handled by handleOptionSelect (which closes the dropdown)
        if (isOpen) {
          handleNewVendor();
        }
      }
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionsRef.current) {
      const highlightedElement = optionsRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [highlightedIndex]);

  // Clear input
  const handleClear = () => {
    setInputValue('');
    onChange('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Input Field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full px-3 py-2 border border-gray-300 rounded-md
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            disabled:bg-gray-100 disabled:cursor-not-allowed
            ${isOpen ? 'border-blue-500' : ''}
            ${isTyping && !options.find(opt => opt.value === inputValue) ? 'border-orange-400' : ''}
          `}
        />

        {/* Clear button */}
        {inputValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-8 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        )}

        {/* Dropdown arrow */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          <div ref={optionsRef}>
            {/* Existing vendor options */}
            {filteredOptions.map((option, index) => (
              <div
                key={option.id || index}
                className={`
                  px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors
                  ${highlightedIndex === index ? 'bg-blue-100' : ''}
                  ${option.value === value ? 'bg-blue-50 text-blue-700' : ''}
                `}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                  handleOptionSelect(option);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{option.value}</span>
                  {option.value === value && <Check size={16} className="text-blue-600" />}
                </div>
                {option.description && (
                  <div className="text-xs text-gray-500 truncate mt-1">
                    {option.description}
                  </div>
                )}
              </div>
            ))}

            {/* New vendor option */}
            {showNewVendorOption && (
              <div
                className={`
                  px-3 py-2 cursor-pointer hover:bg-green-50 transition-colors border-t border-gray-200
                  ${highlightedIndex === filteredOptions.length ? 'bg-green-100' : ''}
                `}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleNewVendor();
                }}
                onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
              >
                <div className="flex items-center text-green-700">
                  <Plus size={16} className="mr-2" />
                  <span>Add "{inputValue.trim()}" as new vendor</span>
                </div>
              </div>
            )}

            {/* No options message */}
            {filteredOptions.length === 0 && !showNewVendorOption && (
              <div className="px-3 py-2 text-gray-500 text-center">
                No vendors found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status indicator */}
      {isTyping && !options.find(opt => opt.value === inputValue) && inputValue.trim() && (
        <div className="absolute -bottom-6 left-0 text-xs text-orange-600">
          New vendor - will be added to system
        </div>
      )}
    </div>
  );
};

export default FlexibleVendorInput;
