// web/src/components/IngredientResultBlock.js
// UPDATED: Removed "Nutritional Value" section entirely
import React, { useMemo } from 'react';
import { ShoppingBag, AlertTriangle, CheckCircle, Replace, ChevronsUp, ChevronsDown, BookOpen, Loader } from 'lucide-react';

// --- Local Dependencies ---
import ProductCard from './ProductCard';
import CollapsibleSection from './CollapsibleSection';
import SubstituteMenu from './SubstituteMenu';

// --- CONFIGURATION ---
const MAX_SUBSTITUTES = 5;

// --- IngredientResultBlock ---
const IngredientResultBlock = ({ ingredientKey, normalizedKey, result, onSelectSubstitute, onQuantityChange }) => {
    const currentQuantity = result.userQuantity || 1;
    const { currentSelection, absoluteCheapestProduct, substitutes } = useMemo(() => {
        const { allProducts, currentSelectionURL } = result;
        if (!allProducts || allProducts.length === 0) return { currentSelection: null, substitutes: [] };
        const cheapest = allProducts.reduce((best, current) => 
            (current.unit_price_per_100 ?? Infinity) < (best.unit_price_per_100 ?? Infinity) ? current : best, 
        allProducts[0]);
        const selection = allProducts.find(p => p.url === currentSelectionURL) || cheapest;
        const sortedSubstitutes = allProducts
            .filter(p => p.url !== selection.url)
            .sort((a, b) => (a.unit_price_per_100 ?? Infinity) - (b.unit_price_per_100 ?? Infinity))
            .slice(0, MAX_SUBSTITUTES);
        return { currentSelection: selection, absoluteCheapestProduct: cheapest, substitutes: sortedSubstitutes };
    }, [result]);

    const isFailed = result.source === 'failed' || result.source === 'error';

    return (
        <div id={`ingredient-${ingredientKey.replace(/\s/g, '-')}`} className={`rounded-xl shadow-2xl border ${isFailed ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
            <div className="p-6">
                <div className="flex justify-between items-start">
                    <h4 className={`text-xl font-bold ${isFailed ? 'text-red-700' : 'text-gray-900'}`}>{ingredientKey}</h4>
                    {isFailed && (
                        <span className="px-3 py-1 text-xs font-bold bg-red-200 text-red-800 rounded-full flex items-center">
                            <AlertTriangle size={12} className="mr-1" /> Failed
                        </span>
                    )}
                </div>
                {isFailed ? (
                     <div className="mt-4 p-4 bg-white rounded-lg shadow-inner">
                        <p className="text-red-700 font-semibold">Could not find a suitable product automatically.</p>
                        <p className="text-sm text-gray-600 mt-1">Please check the "Failed Ingredient History" below for details on the search attempts.</p>
                     </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center my-4 p-2 bg-gray-50 rounded-lg shadow-inner">
                            <p className="font-bold text-gray-700">Total Needed:</p>
                            <p className="px-3 py-1 bg-gray-100 rounded-full text-gray-700">{result.totalGramsRequired > 0 ? `${result.totalGramsRequired}g (${result.quantityUnits})` : 'Not Used'}</p>
                        </div>
                        <div className="flex items-center justify-between mb-6 p-3 bg-indigo-100 rounded-lg shadow-md">
                            <div>
                                <p className="font-bold text-indigo-700">Units to Purchase:</p>
                                <p className="text-xs italic">(Purchase {result.userQuantity} x One Unit)</p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button className="h-8 w-8 text-lg rounded-full bg-red-200 hover:bg-red-300 disabled:opacity-50" onClick={() => onQuantityChange(normalizedKey, -1)} disabled={currentQuantity <= 1}>−</button>
                                <span className="w-10 text-center text-xl font-extrabold">{currentQuantity}</span>
                                <button className="h-8 w-8 text-lg rounded-full bg-green-200 hover:bg-green-300" onClick={() => onQuantityChange(normalizedKey, 1)}>+</button>
                            </div>
                        </div>
                        <div className="mb-6">
                            <h5 className="flex items-center text-lg font-semibold mb-3"><ShoppingBag className="w-5 h-5 mr-2" /> Your Selection</h5>
                            {currentSelection ? (
                                <ProductCard product={currentSelection} isCurrentSelection={true} isAbsoluteCheapest={absoluteCheapestProduct && currentSelection.url === absoluteCheapestProduct.url} />
                            ) : (
                                <div className="p-4 text-center bg-red-50 text-red-800 rounded-lg"><AlertTriangle className="w-6 h-6 inline mr-2" />No product found.</div>
                            )}
                        </div>
                        {/* REMOVED: Nutritional Value section */}
                        {substitutes && substitutes.length > 0 && (
                            <SubstituteMenu substituteCount={substitutes.length}>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {substitutes.map((sub, index) => <ProductCard key={sub.url + index} product={sub} isAbsoluteCheapest={absoluteCheapestProduct && sub.url === absoluteCheapestProduct.url} onSelect={(p) => onSelectSubstitute(normalizedKey, p)} />)}
                                </div>
                            </SubstituteMenu>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default IngredientResultBlock;