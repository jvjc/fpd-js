import Options from './Options.js';
import FancyProductDesignerView from './FancyProductDesignerView.js';
import Translator from '/src/ui/Translator.js';
import UIManager from '/src/ui/UIManager';
import Snackbar from '/src/ui/view/comps/Snackbar';
import EditorBox from '/src/ui/controller/EditorBox';

import { 
    addEvents,
    loadGridImage,
    isPlainObject,
    deepMerge,
    addElemClasses,
    removeElemClasses,
    checkImageDimensions,
    arrayUnique,
    isEmpty,
    popupBlockerAlert,
    localStorageAvailable
} from '/src/helpers/utils';
import { getJSON, postJSON } from '/src/helpers/request';
import { toggleElemClasses } from '../helpers/utils.js';
import {
    loadFonts
} from '/src/helpers/fonts-loader';

/**
 * Creates a new FancyProductDesigner.
 *
 * @class FancyProductDesigner
 * @param  {HTMLElement} elem - The container for the Fancy Product Designer.
 * @param  {Object} [opts={}] - {@link Options Options for configuration}.
 * @extends EventTarget
 */
export default class FancyProductDesigner extends EventTarget {
    
    static forbiddenTextChars = /<|>/g;
    static proxyFileServer = '';
    static uploadsToServer = true;

    /**
     * You can register your own modules and add them in this static property.
     *
     * @public additionalModules
     * @type {Object}
     * @readonly
     * @static
     * @default {}
     * @example {'my-module': ModuleClass}
     */
    static additionalModules = {}; 
        
    /**
     * The container for the Fancy Product Designer.
     *
     * @type {HTMLElement}
     * @readonly
     * @default null
     */
    container = null;
    
    /**
     * The main options set for this Product Designer.
     *
     * @type Object
     * @readonly
     * @default {}
     */
    mainOptions = {};
    
    /**
     * The current selected view instance.
     *
     * @type {FancyProductDesignerView}
     * @readonly


     */
    currentViewInstance = null;
    
    /**
     * The current selected view index.
     *
     * @type Number
     * @default 0


     */
    currentViewIndex = 0;
    
    /**
     * Array containing all products.
     *
     * @type {Array}
     * @readonly


     */
    products = [];
    
    /**
     * Array containing all designs.
     *
     * @type {Array}
     * @readonly


     */
    designs = [];
    
    /**
     * The container for internal modals.
     *
     * @type HTMLElement
     * @default document.body


     */
    modalContainer = document.body;
    
    /**
     * The current selected product category index.
     *
     * @type Number
     * @default 0


     */
    currentCategoryIndex = 0;
    
    /**
     * The current selected product index.
     *
     * @type Number
     * @default 0


     */
    currentProductIndex = 0;
    
    /**
     * Array containing all FancyProductDesignerView instances of the current showing product.
     *
     * @type Array
     * @default []


     */
    viewInstances = [];
    
    /**
     * The initial views of the current product.
     *
     * @type Array
     * @default null


     */
    productViews = null;
    
    /**
     * The current selected element.
     *
     * @property currentElement
     * @type fabric.Object
     * @default null
     */
    currentElement = null;
    
    /**
     * Indicates if the product is created or not.
     *
     * @type Boolean
     * @default false


     */
    productCreated = false;
    
    /**
     * Object containing all color link groups.
     *
     * @type Object
     * @default {}


     */
    colorLinkGroups = {};
    
    /**
     * Array with all added custom elements.
     *
     * @type Array
     * @default []


     */
    globalCustomElements = [];
    
    /**
     * Indicates if the product was saved.
     *
     * @type Boolean
     * @default false


     */
    doUnsavedAlert = false;
    
    /**
     * The price considering the elements price in all views with order quantity.
     *
     * @property currentPrice
     * @type Number
     * @default 0
     */
    currentPrice = 0;
    
    /**
     * The price considering the elements price in all views without order quantity.
     *
     * @property singleProductPrice
     * @type Number
     * @default 0
     */
    singleProductPrice = 0;
    
    /**
     * The calculated price for the pricing rules.
     *
     * @property pricingRulesPrice
     * @type Number
     * @default 0
     */
    pricingRulesPrice = 0;

    /**
	 * URL to the watermark image if one is set via options.
	 *
	 * @property watermarkImg
	 * @type String
	 * @default null
	 */
	watermarkImg = null;

    /**
	 * An array with the current layouts.
	 *
	 * @property currentLayouts
	 * @type Array
	 * @default []
	 */
    currentLayouts = [];
    
    loadingCustomImage = false;
    lazyBackgroundObserver = null;
    draggedPlaceholder = null;
    mouseOverCanvas = false;
    firstProductCreated = false;
    
    #totalProductElements = 0;
    #productElementLoadingIndex = 0;
    #inTextField = false;
    
    constructor(elem, opts={}) {
        
        super();

        if(!elem) {
            console.log("No DOM element found for FPD.");  
            return;
        }
    
        this.lazyBackgroundObserver = new IntersectionObserver((entries, observer) => {

            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    loadGridImage(entry.target);
                    this.lazyBackgroundObserver.unobserve(entry.target);
                }
            });

        });
                
        this.container = elem;
        this.container.instance = this;
        this.mainOptions = Options.merge(Options.defaults, opts);

        //lowercase all keys in hexNames
        let newHexNames = {};
        Object.keys(this.mainOptions.hexNames).forEach((hexKey) => {
            newHexNames[hexKey.toLowerCase()] = this.mainOptions.hexNames[hexKey];            
        })
        this.mainOptions.hexNames = newHexNames;
        
        this.translator = new Translator();
        this.translator.loadLangJSON(this.mainOptions.langJson, this.#langLoaded.bind(this));
                      
    }
    
    #langLoaded() {

        loadFonts(this, (fonts) => {

            this.mainOptions.fonts = fonts;
        
            //timeout when no language json file is loaded
            setTimeout(() => {

                this.uiManager = new UIManager(this);
                this.uiManager.addEventListener('ready', this.#ready.bind(this));                
                this.uiManager.init();

            }, 1)
            
        })    
    
    }
    
    #ready() {
            
        this.dispatchEvent(
            new CustomEvent('ready')
        );
        
        if(this.mainOptions.productsJSON) {
        
            if(typeof this.mainOptions.productsJSON === 'object') {
                this.setupProducts(this.mainOptions.productsJSON);
            }
            else {
                
                getJSON({
                    url: this.mainOptions.productsJSON,
                    onSuccess: (data) => {
                        this.setupProducts(data);
                    },
                    onError: () => {
                        alert('Products JSON could not be loaded. Please check that your URL is correct! URL: '+this.mainOptions.productsJSON);
                    } 
                });                    
        
            }
        
        }
        
        if(this.mainOptions.designsJSON) {
            
            if(typeof this.mainOptions.productsJSON === 'object') {
                this.setupDesigns(this.mainOptions.designsJSON);
            }
            else {
                
                getJSON({
                    url: this.mainOptions.designsJSON,
                    onSuccess: (data) => {
                        this.setupDesigns(data);
                    },
                    onError: () => {
                        alert('Design JSON could not be loaded. Please check that your URL is correct! URL: '+this.mainOptions.designsJSON);
                    } 
                });

            
            }
        
        }
        
        if(this.mainOptions.keyboardControl) {
            
            addEvents(
                document,
                'keydown',
                (evt) => {
                    
                    if(this.currentViewInstance && this.currentViewInstance.fabricCanvas) {
                        
                        const viewInst = this.currentViewInstance;
                        const targetNodename = evt.target.nodeName;
                        const currentElement = viewInst.fabricCanvas.getActiveObject(); 
                                                
                        if(currentElement && !['TEXTAREA', 'INPUT'].includes(targetNodename)) {
                        
                            switch(evt.which) {
                                case 8:
                                    //remove element
                                    if(currentElement.removable) {
                                        viewInst.fabricCanvas.removeElement(currentElement);
                                    }
                        
                                break;
                                case 37: // left
                        
                                    if(currentElement.draggable) {
                                        viewInst.fabricCanvas.setElementParameters({
                                            left: currentElement.left - 1
                                        });
                                    }
                        
                                break;
                                case 38: // up
                        
                                    if(currentElement.draggable) {
                                        viewInst.fabricCanvas.setElementParameters({
                                            top: currentElement.top - 1
                                        });
                                    }
                        
                                break;
                                case 39: // right
                        
                                    if(currentElement.draggable) {
                                        viewInst.fabricCanvas.setElementParameters({
                                            left: currentElement.left + 1
                                        });
                                    }
                        
                                break;
                                case 40: // down
                        
                                    if(currentElement.draggable) {
                                        viewInst.fabricCanvas.setElementParameters({
                                            top: currentElement.top + 1
                                        });
                                    }
                        
                                break;
                        
                                default: return; //other keys
                            }
                        
                            evt.preventDefault();
                        
                        }
                        
                    }                    
                    
                }
            )
        
        }

        //load watermark image
		if(this.mainOptions.watermark) {

			fabric.Image.fromURL(this.mainOptions.watermark, (fabricImg, error) => {
                
                if(!error)
				    this.watermarkImg = fabricImg;

			}, {crossOrigin: "anonymous"});

		}

        if(this.mainOptions.unsavedProductAlert) {

			window.onbeforeunload = () => {
                
				if(this.doUnsavedAlert) {
					return '';
				}

			};

		}
        
        //window resize handler
        let currentWindowWidth = 0;
        window.addEventListener('resize', (evt) => {

            //fix for android browser, because keyboard trigger resize event
            if(window.innerWidth === currentWindowWidth || this.#inTextField) {
                return;
            }
            
            currentWindowWidth = window.innerWidth;
                            
            if(this.currentViewInstance) {
                this.currentViewInstance.fabricCanvas.resetSize();
            }
                            
            //deselect element if one is selected and active element is not input (FB browser fix)
            if(this.currentElement && !['INPUT', 'TEXTAREA'].includes(document.activeElement)) {
                this.deselectElement();
            }

        })

        addEvents(
            this,
            ['productCreate', 'layoutElementsAdded'],
            this.#addGlobalElements.bind(this)
        )
        
        //window.localStorage.setItem('fpd-gt-closed', 'no');
        addEvents(
            this,
            ['productCreate', 'modalDesignerOpen'],
            (evt) => {

                if((!this.firstProductCreated && !this.mainOptions.modalMode) || (!this.firstProductCreated && evt.type === 'modalDesignerOpen')) {
                    
                    if(this.mainOptions.autoOpenInfo && this.actionsBar) {

                        this.actionsBar.doAction('info');
    
                    }
    
                    if(this.guidedTour) {                        
                                                
                        if(localStorageAvailable()) {

                            if(window.localStorage.getItem('fpd-gt-closed') !== 'yes') {
                                this.guidedTour.start();
                            }

                        }
                        else {
                            this.guidedTour.start();
                        }
    
                    }
    
                }
    
                this.firstProductCreated = this.mainOptions.modalMode && evt.type === 'modalDesignerOpen';

            }
        )

        addEvents(
            document.body,
            ['focusin', 'blur'],
            (evt) => {
                
                if(['TEXTAREA', 'INPUT'].includes(evt.target.nodeName)) {
                    this.#inTextField = evt.type == 'focusin'; 
                }                

            },
            true
        )

        addEvents(
            document.body,
            ['mouseup', 'touchend'],
            (evt) => {
                
                let fpdContainers = Array.from(document.querySelectorAll('.fpd-container'));
                const clickedWithinContainer = Boolean(fpdContainers.find((container) => container.contains(evt.target)));
                
                //deselect element if click outside of a fpd-container
                if(!clickedWithinContainer && this.mainOptions.deselectActiveOnOutside) {
                    
                    this.deselectElement();

                }

            },
            true
        )

        //dragging image/design to canvas or upload zone
        if(this.mainOptions.dragDropImagesToUploadZones) {
            
            let targetGridItem = null;
            addEvents(
                document.body,
                ['mousedown', 'touchstart'],
                (evt) => {
                    
                    //only left mouse 
                    if(evt.which == 1) {
                        
                        const target = evt.target;
                        if(target.classList.contains('fpd-draggable')) {
                            
                            targetGridItem = target;

                            this.draggedPlaceholder = document.createElement('div');
                            this.draggedPlaceholder.className = 'fpd-dragged-image fpd-shadow-1 fpd-hidden';
                            this.draggedPlaceholder.style.backgroundImage = `url("${target.querySelector('picture').dataset.img}")`;
                            document.body.append(this.draggedPlaceholder);
                            
                        }

                    }

                }
            )

            addEvents(
                document.body,
                ['mousemove'],
                (evt) => {

                    if(this.draggedPlaceholder) {
                        
                        this.draggedPlaceholder.style.left = (evt.pageX - targetGridItem.offsetWidth * 0.5)+'px';
                        this.draggedPlaceholder.style.top = (evt.pageY - targetGridItem.offsetHeight * 0.5)+'px';

                        removeElemClasses(
                            this.draggedPlaceholder,
                            ['fpd-hidden']
                        )
                        setTimeout(() => {

                            if(this.draggedPlaceholder) {
                                addElemClasses(this.draggedPlaceholder, ['fpd-animate']);
                            }

                        }, 1);

                        evt.stopPropagation();
                        evt.preventDefault();

                    }

                }
            )

            addEvents(
                document.body,
                ['mouseup'],
                (evt) => {    
                    
                    if(this.draggedPlaceholder) {

                        this.draggedPlaceholder.remove();
                        this.draggedPlaceholder = null;

                    }                    
                                        
                    if(!this.loadingCustomImage && targetGridItem && this.mouseOverCanvas) {
                        
                        this._addGridItemToCanvas(
                            targetGridItem,
                            this.mouseOverCanvas.uploadZone ? {_addToUZ: this.mouseOverCanvas.title} : {}
                        );
        
                    }
        
                    targetGridItem = null;
                    this.mouseOverCanvas = false;

                }
            )

        }

        if(typeof this.mainOptions.editorMode === 'string') {
            new EditorBox(this);
        }
            
    }

    #addGlobalElements() {

        const globalElements = this.globalCustomElements.concat(this.fixedElements);
        if(!globalElements.length) return;

        let globalElementsCount = 0;
        const _addCustomElement = (object) => {
            
            const viewInstance = this.viewInstances[object.viewIndex];

            if(viewInstance) { //add element to correct view

                const fpdElement = object.element;

                //if element exists, do not add
                if(!viewInstance.fabricCanvas.getElementByTitle(fpdElement.title)) {

                    let propertyKeys = Object.keys(this.mainOptions.elementParameters);
                    if(fpdElement.getType() === 'text') {
                        propertyKeys = propertyKeys.concat(Object.keys(this.mainOptions.textParameters));
                    }
                    else {
                        propertyKeys = propertyKeys.concat(Object.keys(this.mainOptions.imageParameters));
                    }

                    let elementProps = fpdElement.getElementJSON(false, propertyKeys);

                    //delete old printing box to fetch printing box from current view
                    if(elementProps._printingBox) {
                        delete elementProps.boundingBox;
                    }
                    
                    viewInstance.fabricCanvas.addElement(
                        fpdElement.getType(),
                        fpdElement.source,
                        fpdElement.title,
                        elementProps
                    );

                }

            }
            else {
                _customElementAdded();
            }

        };

        const _customElementAdded = () => {

            globalElementsCount++;
            if(globalElementsCount < globalElements.length) {
                _addCustomElement(globalElements[globalElementsCount]);
            }
            else {
                this.removeEventListener('elementAdd', _customElementAdded);
            }

        };

        addEvents(
            this,
            'elementAdd',
            _customElementAdded
        )
                
        if(globalElements[0])
            _addCustomElement(globalElements[0]);

    }
    
    //get category index by category name
    #getCategoryIndexInProducts(catName) {
        
        var catIndex = this.products.findIndex(obj => obj.category === catName);
        return catIndex === -1 ? false : catIndex;
    
    };
    
    setupProducts(products=[]) {
                        
        this.products = [];
        
        products.forEach((productItem) => {
        
            if(productItem.hasOwnProperty('category')) { //check if products JSON contains categories
        
                productItem.products.forEach((singleProduct) => {
                    this.addProduct(singleProduct, productItem.category);
                });
        
            }
            else {
                this.addProduct(productItem);
            }
        
        });
        
        //load first product
        if(this.mainOptions.loadFirstProductInStage && products.length > 0) {
            this.selectProduct(0);
        }
        else {
            this.toggleSpinner(false);
        }
        
        /**
         * Gets fired as soon as products are set.
         *
         * @event productsSet
         * @param {CustomEvent} event
         */
        this.dispatchEvent(
            new CustomEvent('productsSet')
        );
        
    }
    
    /**
     * Set up the designs with a JSON.
     *
     * @method setupDesigns
     * @param {Array} designs An array containg the categories with designs.
     */
    setupDesigns(designs) {

        this.designs = designs;
                
        /**
         * Gets fired as soon as the designs are set.
         *
         * @event designsSet
         * @param {CustomEvent} event
         */
        this.dispatchEvent(
            new CustomEvent('designsSet')
        );

    };
    
    /**
     * Adds a new product to the product designer.
     *
     * @method addProduct
     * @param {array} views An array containing the views for a product. A view is an object with a title, thumbnail and elements property. The elements property is an array containing one or more objects with source, title, parameters and type.
     * @param {string} [category] If categories are used, you need to define the category title.
     */
    addProduct(views, category) {
        
        var catIndex = this.#getCategoryIndexInProducts(category);
        
        if(category === undefined) {
            this.products.push(views);
        }
        else {
        
            if(catIndex === false) {
        
                catIndex = this.products.length;
                this.products[catIndex] = {category: category, products: []};
        
            }
        
            this.products[catIndex].products.push(views);
        
        }
        
        /**
         * Gets fired when a product is added.
         *
         * @event productAdd
         * @param {CustomEvent} event
         * @param {Array} event.detail.views - The product views.
         * @param {String} event.detail.category - The category title.
         * @param {Number} event.detail.catIndex - The index of the category.
         */
        this.dispatchEvent(
            new CustomEvent('productAdd', {
                detail: {
                    views: views,
                    category: category,
                    catIndex: catIndex
                }
            })
        );
        
    }
    
    selectProduct(index, categoryIndex) {
        
        this.currentCategoryIndex = categoryIndex === undefined ? this.currentCategoryIndex : categoryIndex;
        
        let productsObj;
        if(this.products && this.products.length && this.products[0].category) { 
            //categories enabled
            const category = this.products[this.currentCategoryIndex];
            productsObj = category.products;
        }
        else { 
            //no categories enabled
            productsObj = instance.products;
        }
        
        this.currentProductIndex = index;
        if(index < 0) { 
            this.currentProductIndex = 0; 
        }
        else if(index > productsObj.length-1) { 
            this.currentProductIndex = productsObj.length-1; 
        }
        
        const product = productsObj[this.currentProductIndex];
        
        this.loadProduct(
            product, 
            this.mainOptions.replaceInitialElements
        );
                
    }
    
    /**
     * Loads a new product to the product designer.
     *
     * @method loadProduct
     * @param {array} views An array containing the views for the product.
     * @param {Boolean} [onlyReplaceInitialElements=false] If true, the initial elements will be replaced. Custom added elements will stay on the canvas.
     * @param {Boolean} [mergeMainOptions=false] Merges the main options into every view options.
     */
    loadProduct(views, replaceInitialElements=false, mergeMainOptions=false) {
        
        if(!views) { return; }

        /**
         * Gets fired when a product is selected.
         *
         * @event productSelect
         * @param {CustomEvent} event
         * @param {Object} event.detail.product - An object containing the product (views).
         */
        this.dispatchEvent(
            new CustomEvent('productSelect', {
                detail: {
                    product: views
                }
            })
        );
        
        this.toggleSpinner(true);
        
        //reset when loading a product
        this.productCreated = false;
        this.colorLinkGroups = {};
    
        this.globalCustomElements = [];
        if(replaceInitialElements) {
            this.globalCustomElements = this.getCustomElements();
        }
        else {
            this.doUnsavedAlert = false;
        }
    
        this.fixedElements = this.getFixedElements();
    
        this.reset();
    
        if(mergeMainOptions) {
    
            views.forEach((view, i) => {
                view.options = Options.merge(this.mainOptions, view.options);
            });
    
        }
    
        this.productViews = views;
    
        this.#totalProductElements = this.#productElementLoadingIndex = 0;
        views.forEach((view, i) => {
            this.#totalProductElements += view.elements.length;
        });
        
    
        addEvents(
            this,
            'viewCreate',
            this.#onViewCreated
        )
    
        if(views) {
            this.addView(views[0]);
        }
    
    }
    
    /**
     * Adds a view to the current visible product.
     *
     * @method addView
     * @param {object} view An object with title, thumbnail and elements properties.
     */
    addView(view) {
    
        //get relevant view options
        let relevantMainOptions = {};
        FancyProductDesignerView.relevantOptions.forEach((key) => {
            
            let mainProp = this.mainOptions[key];
            relevantMainOptions[key] = isPlainObject(mainProp) ? {...mainProp} : mainProp;
            
        })
            
        view.options = isPlainObject(view.options) ? deepMerge(relevantMainOptions, view.options) : relevantMainOptions;
                
        let viewInstance = new FancyProductDesignerView(
            this.productStage, 
            view, 
            this.#viewStageAdded.bind(this), 
            this.mainOptions.fabricCanvasOptions 
        );
        
        viewInstance.fabricCanvas.on({
            'mouse:move': (opts) => {

                this.mouseOverCanvas = opts.target ? opts.target : true;                                

            },
            'mouse:out': (opts) => {

                this.mouseOverCanvas = false;                                

            },
            'beforeElementAdd': (opts) => {

                if(!this.productCreated) {

                    this.#productElementLoadingIndex++;
        
                    const txt = opts.title + '<br>' + String(this.#productElementLoadingIndex) + '/' + this.#totalProductElements;                    
                    this.mainLoader.querySelector('.fpd-loader-text').innerHTML = txt;

                }

                /**
                 * Gets fired when an element is added.
                 *
                 * @event beforeElementAdd
                 * @param {Event} event
                 * @param {fabric.Object} element
                 */
                this.dispatchEvent(
                    new CustomEvent('beforeElementAdd', {
                        detail: {
                            element: opts
                        }
                    })
                );
                
            },
            'elementAdd': ({element}) => {
                
                if(!element) {

                    this.toggleSpinner(false);
                    return;

                }
                
                if(this.productCreated && element.getType() == 'image' && element.isCustom) {

                    this.toggleSpinner(false);
                }

                //element should be replaced in all views
                if(element.replace && element.replaceInAllViews) {

                    this.viewInstances.forEach((viewInst, i) => {

                        if(this.currentViewIndex != i) {
                        
                            const replacedElem = viewInst.fabricCanvas.getElementByReplace(element.replace);
                                                        
                            if(replacedElem && !element._replaceAdded) {

                                viewInst.fabricCanvas.addElement(
                                    element.getType(), 
                                    element.source, 
                                    element.title, 
                                    {...element.originParams, _replaceAdded: true}
                                );

                            }
                                
                        }
                        

                    })

                }
    
                //check if element has a color linking group
                if(element.colorLinkGroup && element.colorLinkGroup.length > 0 && !this.mainOptions.editorMode) {
                                        
                    var viewIndex = this.getViewIndexByWrapper(viewInstance.fabricCanvas.wrapperEl);
        
                    if(this.colorLinkGroups.hasOwnProperty(element.colorLinkGroup)) { //check if color link object exists for the link group
        
                        //add new element with id and view index of it
                        this.colorLinkGroups[element.colorLinkGroup].elements.push({id: element.id, viewIndex: viewIndex});
        
                        if(typeof element.colors === 'object') {
        
                            //create color group colors
                            const colorGroupColors = this.mainOptions.replaceColorsInColorGroup ? element.colors : this.colorLinkGroups[element.colorLinkGroup].colors.concat(element.colors);                            
                            this.colorLinkGroups[element.colorLinkGroup].colors = arrayUnique(colorGroupColors);
        
                        }
        
                    }
                    else {
        
                        //create initial color link object
                        this.colorLinkGroups[element.colorLinkGroup] = {elements: [{id:element.id, viewIndex: viewIndex}], colors: []};
        
                        if(typeof element.colors === 'object') {
        
                            this.colorLinkGroups[element.colorLinkGroup].colors = element.colors;
        
                        }
        
                    }
        
                }

                if(this.productCreated && this.mainOptions.hideDialogOnAdd && this.mainBar) {
                    this.mainBar.toggleContentDisplay(false);
                }

                /**
                 * Gets fired when an element is added.
                 *
                 * @event elementAdd
                 * @param {Event} event
                 * @param {fabric.Object} element
                 */
                this.dispatchEvent(
                    new CustomEvent('elementAdd', {
                        detail: {
                            element: element
                        }
                    })
                );
                
                this.dispatchEvent(
                    new CustomEvent('viewCanvasUpdate', {
                        detail: {
                            viewInstance: viewInstance
                        }
                    })
                );
                
            },
            'elementRemove': ({element}) => {

                //delete fixed element
                const deleteIndex = this.fixedElements.findIndex((item) => {
                    return item.element.title == element.title
                })
        
                if(deleteIndex != -1) {
                    this.fixedElements.splice(deleteIndex, 1);
                }

                /**
                 * Gets fired as soon as an element has been removed.
                 *
                 * @event elementRemove
                 * @param {Event} event
                 * @param {fabric.Object} element - The fabric object that has been removed.
                 */
                this.dispatchEvent(
                    new CustomEvent('elementRemove', {
                        detail: {
                            element: element
                        }
                    })
                );

                this.dispatchEvent(
                    new CustomEvent('viewCanvasUpdate', {
                        detail: {
                            viewInstance: viewInstance
                        }
                    })
                );
                

            },
            'elementSelect': ({element}) => {
                
                this.currentElement = element;
                
                this.#updateElementTooltip();
                
                if(element && !element._ignore && this.currentViewInstance) {

                    //upload zone is selected
                    if(element.uploadZone && !this.mainOptions.editorMode) {
                        
                        let customAdds = deepMerge(
                            this.currentViewInstance.options.customAdds,
                            element.customAdds || {}
                        );

                        //mobile fix: elementSelect is triggered before click, this was adding an image on mobile
                        setTimeout(() => {
                            this.currentViewInstance.currentUploadZone = element.title;
                            this.mainBar.toggleUploadZonePanel(true, customAdds);
                        }, 100);

                        return;
                    }
                    //if element has no upload zone and an upload zone is selected, close dialogs and call first module
                    else if(this.currentViewInstance.currentUploadZone) {

                        this.mainBar.toggleUploadZonePanel(false);

                    }

                    //TODO:

                    // if(instance.mainOptions.openTextInputOnSelect && FPDUtil.getType(element.type) === 'text' && element.editable) {
                    //     $elementToolbar.find('.fpd-tool-edit-text:first').click();
                    // }

                }

                /**
                 * Gets fired when an element is selected.
                 *
                 * @event elementSelect
                 * @param {Event} event
                 */
                this.dispatchEvent(
                    new CustomEvent('elementSelect')
                );

            },
            'elementCheckContainemt': ({target, boundingBoxMode}) => {

                if(boundingBoxMode === 'inside') {
        
                    this.#updateElementTooltip();
        
                }

            },
            'elementColorChange': ({element, colorLinking}) => {                
                
                if(this.productCreated && colorLinking && element.colorLinkGroup && element.colorLinkGroup.length > 0) {
        
                    const group = this.colorLinkGroups[element.colorLinkGroup];

                    if(group && group.elements) {

                        group.elements.forEach((groupElem) => {
                            
                            if(element.id, groupElem.id) {

                                const targetView = this.viewInstances[groupElem.viewIndex];
                                const targetElem = targetView.fabricCanvas.getElementByID(groupElem.id);
                                
                                if(targetElem)
                                    targetElem.changeColor(element.fill, false);

                            }

                        })

                    }
        
                }

                /**
                 * Gets fired when the color of an element is changed.
                 *
                 * @event elementColorChange
                 * @param {Event} event
                 * @param {fabric.Object} element
                 * @param {String} hex Hexadecimal color string.
                 * @param {Boolean} colorLinking Color of element is linked to other colors.
                 */                
                this.dispatchEvent(
                    new CustomEvent('elementColorChange', {
                        detail: {
                            element: element,
                            colorLinking: colorLinking
                        }
                    })
                );

                this.dispatchEvent(
                    new CustomEvent('viewCanvasUpdate', {
                        detail: {
                            viewInstance: viewInstance
                        }
                    })
                );                
            
            },
            'elementChange': ({element, type}) => {

                this.#updateElementTooltip();
                
                this.dispatchEvent(
                    new CustomEvent('elementChange', {
                        detail: {
                            type: type,
                            element: element
                        }
                    })
                )

            },
            'elementModify': ({element, options}) => {

                this.applyTextLinkGroup(element, options);
                
                this.dispatchEvent(
                    new CustomEvent('elementModify', {
                        detail: {
                            options: options,
                            element: element
                        }
                    })
                );

                this.dispatchEvent(
                    new CustomEvent('viewCanvasUpdate', {
                        detail: {
                            viewInstance: viewInstance
                        }
                    })
                );

            },
            'text:changed': ({target}) => {

                this.applyTextLinkGroup(target, {text: target.text});         

            },
            'history:append': () => { this.#historyAction('append') },
            'history:clear': () => { this.#historyAction('clear') },
            'history:undo': () => { this.#historyAction('undo') },
            'history:redo': () => { this.#historyAction('redo') },
        })
    
        // todo
    //     $(viewInstance)
    //     .on('priceChange', function(evt, price, viewPrice) {
    // 
    //         var truePrice = instance.calculatePrice();
    // 
    //         /**
    //          * Gets fired as soon as the price changes in a view.
    //          *
    //          * @event priceChange
    //          * @param {Event} event
    //          * @param {number} elementPrice - The price of the element.
    //          * @param {number} totalPrice - The true price of all views with quantity.
    //          * @param {number} singleProductPrice - The true price of all views without quantity.
    //          */
    //         $elem.trigger('priceChange', [price, truePrice, instance.singleProductPrice]);
    // 
    //     })
    //     .on('textEditEnter', function() {
    // 
    //         if(instance.currentElement) {
    //             instance.toolbar.updatePosition(instance.currentElement);
    //         }
    // 
    //     })
    
        viewInstance.init();
    
    }

    #onViewCreated() {
            
        //add all views of product till views end is reached
        if(this.viewInstances.length < this.productViews.length) {
    
            this.addView(this.productViews[this.viewInstances.length]);
    
        }
        //all views added
        else {
            
            this.removeEventListener('viewCreate', this.#onViewCreated);
    
            this.toggleSpinner(false);            
            this.selectView(0);
            
            //select element with autoSelect enabled
            if(!this.mainOptions.editorMode 
                && this.currentViewInstance 
                && this.currentViewInstance.fabricCanvas.wrapperEl.offsetParent //canvas is visible
            ) {

                this.doAutoSelect();

            }
    
            this.productCreated = true;

            const productLayouts = this.productViews[0].options.layouts;

            if(typeof productLayouts == 'string') {

                getJSON({
                    url: productLayouts,
                    onSuccess: (data) => {
    
                        this.currentLayouts = data;
                        this.dispatchEvent(
                            new CustomEvent('layoutsSet')
                        );
    
                    },
                    onError: () => {
                        alert('Layouts JSON could not be loaded. Please check that your URL is correct! URL: '+this.mainOptions.layouts);
                    } 
                });  
    
            }
            else if(Array.isArray(productLayouts)) {

                this.currentLayouts = productLayouts;
                this.dispatchEvent(
                    new CustomEvent('layoutsSet')
                );

            }
        
            /**
             * Gets fired as soon as a product has been fully added to the designer.
             *
             * @event productCreate
             * @param {Event} event
             */
            this.dispatchEvent(
                new CustomEvent('productCreate')
            );
    
        }
    
    }

    #historyAction(type) {        

        /**
         * Gets fired as soon as any action for canvas history is executed.
         *
         * @event historyAction
         * @param {Event} event
         */
        this.dispatchEvent(
            new CustomEvent('historyAction', {
                detail: {
                    type: type
                }
            })
        );

        this.#toggleUndoRedoBtns();

    }

    #toggleUndoRedoBtns() {   

        if(this.currentViewInstance) {
            
            const historyUndo = this.currentViewInstance.fabricCanvas.historyUndo;
            const historyRedo = this.currentViewInstance.fabricCanvas.historyRedo;

            if(historyUndo.length)
                this.doUnsavedAlert = true;
                
            if(historyUndo) {

                toggleElemClasses(
                    document.body.querySelectorAll('.fpd-btn[data-action="undo"]'),
                    ['fpd-disabled'],
                    historyUndo.length == 0
                )

                toggleElemClasses(
                    document.body.querySelectorAll('.fpd-btn[data-action="redo"]'),
                    ['fpd-disabled'],
                    historyRedo.length == 0
                )

            }

        }

    }

    doAutoSelect() {

        let selectElement = null;
        const viewElements = this.currentViewInstance.fabricCanvas.getObjects();
        viewElements.forEach((obj) => {
            
            if(obj.autoSelect && !obj.hasUploadZone) {
                selectElement = obj;
            }

        })

        if(selectElement) {

            setTimeout(() => {
                this.currentViewInstance.fabricCanvas.setActiveObject(selectElement);
            }, 500);

        }

    }
    
    #viewStageAdded(viewInstance) {
        
        //do not add view instance, if wrapper is not in dom, e.g. has been removed
        if(!viewInstance.fabricCanvas.wrapperEl.parentNode) return;
        
        this.viewInstances.push(viewInstance);
        
        viewInstance.fabricCanvas.on(
            'sizeUpdate',
            ({canvasHeight}) => {
                
                let mainHeight = canvasHeight+'px';

                this.productStage.style.height = mainHeight;
                
                const mainBarClasslist = this.container.classList;
                if(mainBarClasslist.contains('fpd-sidebar')) {

                    this.mainBar.container.style.height = mainHeight;

                    //if main wrapper has a different height, adjust main bar height to that height
                    if(canvasHeight != this.mainWrapper.container.offsetHeight)
                        this.mainBar.container.style.height = this.mainWrapper.container.offsetHeight+'px';

                }                
                
            }
        )
        
        /**
         * Gets fired when a view is created.
         *
         * @event viewCreate
         * @param {Event} event
         * @param {FancyProductDesignerView} viewInstance
         */
        this.dispatchEvent(
            new CustomEvent('viewCreate', {
                detail: {
                    viewInstance: viewInstance
                }
            })
        );
        
        viewInstance.fabricCanvas.onHistory();
        viewInstance.fabricCanvas.clearHistory();
        
    }

    #updateElementTooltip() {

		const element = this.currentElement;
        
		if(this.productCreated && element && !element.uploadZone && !element.__editorMode) {

            if(element.isOut && element.boundingBoxMode === 'inside') {

                const label = this.translator.getTranslation('misc', 'out_of_bounding_box');
                this.mainTooltip.innerHTML = label;
                this.mainTooltip.classList.add('fpd-show');

			}
			else if(this.mainOptions.imageSizeTooltip && element.getType() === 'image') {                
				this.mainTooltip.innerText = (parseInt(element.width * element.scaleX) +' x '+ parseInt(element.height * element.scaleY));
                this.mainTooltip.classList.add('fpd-show');
			}
			else {
                this.mainTooltip.classList.remove('fpd-show');
			}

            if(this.mainTooltip.classList.contains('fpd-show')) {
                
                const oCoords = element.oCoords;
                const viewStageRect = this.currentViewInstance.fabricCanvas.wrapperEl.getBoundingClientRect();                
                
                this.mainTooltip.style.left = (viewStageRect.left + oCoords.mt.x - this.mainTooltip.clientWidth / 2)+'px';
                this.mainTooltip.style.top = (viewStageRect.top + oCoords.mt.y - this.mainTooltip.clientHeight - 20)+'px';

            }

		}
        else {
            this.mainTooltip.classList.remove('fpd-show');
        }

	}

    applyTextLinkGroup(element, options={}) {

        if(!element) return;

        //text link group        
        if(!isEmpty(element.textLinkGroup)) {

            const textLinkGroupProps = this.mainOptions.textLinkGroupProps || [];

            this.viewInstances.forEach((viewInst) => {

                viewInst.fabricCanvas.getObjects().forEach(fabricObj => {

                    if(fabricObj !== element 
                        && fabricObj.getType() === 'text' 
                        && fabricObj.textLinkGroup === element.textLinkGroup
                    ) {
                        
                        if(options.text) {

                            fabricObj.set('text', element.text);

                            this.dispatchEvent(
                                new CustomEvent('textLinkApply', {
                                    detail: {
                                        element: fabricObj,
                                        options: {
                                            text: element.text
                                        }
                                    }
                                })
                            );
                        }
                            

                        //get all property keys that are in textLinkGroupProps option
                        const linkedPropKeys = Object.keys(options).filter(key => textLinkGroupProps.includes(key));
                        //copy linked props to other text elements
                        linkedPropKeys.forEach(propKey => {
                            fabricObj.set(propKey, element[propKey]);
                            
                            this.dispatchEvent(
                                new CustomEvent('textLinkApply', {
                                    detail: {
                                        element: fabricObj,
                                        options: {
                                            [propKey]: element[propKey]
                                        }
                                    }
                                })
                            );
                        })
                        
                        viewInst.fabricCanvas.renderAll();
                        //todo
                        //$elem.trigger('_doPricingRules');
                    }
                    

                })

            })

        }   

    }

    /**
	 * Gets the index of the view.
	 *
	 * @method getIndex
	 * @return {Number} The index.
	 */
	getViewIndexByWrapper(wrapperEl) {

        return Array.from(this.productStage.querySelectorAll('.fpd-view-stage')).indexOf(wrapperEl);

	}
    
    toggleSpinner(toggle=true, msg='') {
        
        this.mainLoader.querySelector('.fpd-loader-text').innerText = msg;
        this.mainLoader.classList.toggle('fpd-hidden', !toggle);

        return this.mainLoader; 
        
    }
    
    /**
     * Selects a view from the current visible views.
     *
     * @method selectView
     * @param {number} index The requested view by an index value. 0 will load the first view.
     */
    selectView(index=0) {
                
        if(this.viewInstances.length <= 0) {return;}
        
        if(this.currentViewInstance && this.currentViewInstance.fabricCanvas)
            this.currentViewInstance.fabricCanvas.resetZoom();
        
        this.currentViewIndex = index;
        if(index < 0) { 
            this.currentViewIndex = 0; 
        }
        else if(index > this.viewInstances.length-1) { 
            this.currentViewIndex = this.viewInstances.length-1; 
        }                
        
        if(this.currentViewInstance && this.currentViewInstance.fabricCanvas)    
            this.currentViewInstance.fabricCanvas.clearHistory();
        
        
        this.currentViewInstance = this.viewInstances[this.currentViewIndex];
        
        this.deselectElement();
        
        //select view wrapper and render stage of view
        const viewStages = this.productStage.querySelectorAll('.fpd-view-stage');
        addElemClasses(
            viewStages,
            ['fpd-hidden']
        );
                
        removeElemClasses(
            viewStages.item(this.currentViewIndex),
            ['fpd-hidden']
        );

        //toggle next/previous view buttons
        toggleElemClasses(
            document.body.querySelectorAll('.fpd-btn[data-action="previous-view"], .fpd-btn[data-action="next-view"], fpd-views-nav'),
            ['fpd-hidden'],
            this.viewInstances.length <= 1
        )

        toggleElemClasses(
            document.body.querySelectorAll('.fpd-btn[data-action="previous-view"], .fpd-view-prev'),
            ['fpd-disabled'],
            this.currentViewIndex == 0
        )
        
        toggleElemClasses(
            document.body.querySelectorAll('.fpd-btn[data-action="next-view"], .fpd-view-next'),
            ['fpd-disabled'],
            this.currentViewIndex === this.viewInstances.length - 1
        )

        this.#toggleUndoRedoBtns();
        this.currentViewInstance.fabricCanvas.snapToGrid = false;
        this.currentViewInstance.fabricCanvas.enableRuler = false;
        
        //reset view canvas size
        this.currentViewInstance.fabricCanvas.resetSize();
        
        /**
         * Gets fired as soon as a view has been selected.
         *
         * @event viewSelect
         * @param {Event} event
         */
        this.dispatchEvent(
            new CustomEvent('viewSelect')
        );
        
    }
    
    /**
     * Returns an array with fabricjs objects.
     *
     * @method getElements
     * @param {Number} [viewIndex=-1] The index of the target view. By default all views are target.
     * @param {String} [elementType='all'] The type of elements to return. By default all types are returned. Possible values: text, image.
     * @param {String} [deselectElement=true] Deselect current selected element.
     * @return {Array} An array containg the elements.
     */
    getElements(viewIndex, elementType='all', deselectElement=true) {
    
        viewIndex = viewIndex === undefined || isNaN(viewIndex) ? -1 : viewIndex;
                
        if(deselectElement) {
            this.deselectElement();
        }
    
        let allElements = [];
        if(viewIndex === -1) {
    
            for(var i=0; i < this.viewInstances.length; ++i) {
                allElements = allElements.concat(this.viewInstances[i].fabricCanvas.getObjects());
            }
    
        }
        else {
    
            if(this.viewInstances[viewIndex]) {
                allElements = this.viewInstances[viewIndex].fabricCanvas.getObjects();
            }
            else {
                return [];
            }
    
        }
    
        //remove ignore objects
        allElements = allElements.filter((obj) => {
            return !obj._ignore;
        });
    
        if(elementType === 'text') {
    
            let textElements = [];
            allElements.forEach((elem) => {
    
                if(elem.getType(elem) === 'text') {
                    textElements.push(elem);
                }
    
            });
    
            return textElements;
    
        }
        else if(elementType === 'image') {
    
            let imageElements = [];
            allElements.forEach(function(elem) {
    
                if(elem.getType() === 'image') {
                    imageElements.push(elem);
                }
    
            });
    
            return imageElements;
    
        }
    
        return allElements;
    
    };
    
    /**
     * Returns an array with all custom added elements.
     *
     * @method getCustomElements
     * @param {string} [type='all'] The type of elements. Possible values: 'all', 'image', 'text'.
     * @param {Number} [viewIndex=-1] The index of the target view. By default all views are target.
     * @param {String} [deselectElement=true] Deselect current selected element.
     * @return {array} An array with objects with the fabric object and the view index.
     */
    getCustomElements(type='all', viewIndex=-1, deselectElement=true) {
        
        let customElements = [];
        
        const elements = this.getElements(viewIndex, type, deselectElement);
        elements.forEach((element) => {
    
            if(element.isCustom) {
                
                const viewIndex = this.getViewIndexByWrapper(element.canvas.wrapperEl);
                
                customElements.push({element: element, viewIndex: viewIndex});
    
            }
    
        });
    
        return customElements;
    
    }
    
    /**
     * Returns an array with all fixed elements.
     *
     * @method getFixedElements
     * @param {string} [type='all'] The type of elements. Possible values: 'all', 'image', 'text'.
     * @param {Number} [viewIndex=-1] The index of the target view. By default all views are target.
     * @param {String} [deselectElement=true] Deselect current selected element.
     * @return {array} An array with objects with the fabric object and the view index.
     */
    getFixedElements(type='all', viewIndex=-1, deselectElement=true) {
        
        let fixedElements = [];
    
        const elements = this.getElements(viewIndex, type, deselectElement);
        elements.forEach((element) => {
    
            if(element.fixed) {
    
                const viewIndex = this.getViewIndexByWrapper(element.canvas.wrapperEl);
                fixedElements.push({element: element, viewIndex: viewIndex});
    
            }
    
        });
                
        return fixedElements;
    
    }
    
    /**
     * Get an elment by ID.
     *
     * @method getElementByID
     * @param {Number} id The id of an element.
     * @param {Number} [viewIndex] The view index you want to search in. If no index is set, it will use the current showing view.
     */
     getElementByID(id, viewIndex) {
    
        viewIndex = viewIndex === undefined ? this.currentViewIndex : viewIndex;
    
        return this.viewInstances[viewIndex] ? this.viewInstances[viewIndex].fabricCanvas.getElementByID(id) : null;
    
    };
    
    /**
     * Clears the product stage and resets everything.
     *
     * @method reset


     */
    reset() {
    
        if(this.productViews === null) return;
                
        this.removeEventListener('viewCreate', this.#onViewCreated)
    
        this.deselectElement();
        if(this.currentViewInstance)
            this.currentViewInstance.fabricCanvas.resetZoom();

        this.currentViewIndex = this.currentPrice = this.singleProductPrice = this.pricingRulesPrice = 0;
        this.currentViewInstance = this.productViews = this.currentElement = null;
    
        this.viewInstances.forEach((viewInst) => {            
            viewInst.fabricCanvas.dispose();
        });
        
        this.productStage.innerHTML = '';  
        this.viewInstances = [];
    
        /**
         * Gets fired as soon as the stage has been cleared.
         *
         * @event clear
         * @param {Event} event
         */
        this.dispatchEvent(
            new CustomEvent('clear')
        );
        
        this.dispatchEvent(
            new CustomEvent('priceChange')
        );
            
    };
    
    /**
     * Deselects the selected element of the current showing view.
     *
     * @method deselectElement


     */
    deselectElement() {
                     
        if(this.currentViewInstance && this.currentViewInstance.fabricCanvas) {
                
            this.currentViewInstance.fabricCanvas.deselectElement();
            this.currentElement = null;
        
        }
        
    }
    
    /**
     * Formats the price to a string with the currency and the decimal as well as the thousand separator.
     *
     * @method formatPrice
     * @param {Number} [price] The price thats gonna be formatted.
     * @return {String} The formatted price string.


     */
    formatPrice(price) {
        
        const priceFormatOpts = this.mainOptions.priceFormat;

        if(price && typeof priceFormatOpts === 'object') {
    
            const thousandSep = priceFormatOpts.thousandSep;
            const decimalSep = priceFormatOpts.decimalSep;
    
            let splitPrice = price.toString().split('.'),
                absPrice = splitPrice[0],
                decimalPrice = splitPrice[1],
                tempAbsPrice = '';
    
            if (typeof absPrice != 'undefined') {
    
                for (var i=absPrice.length-1; i>=0; i--) {
                    tempAbsPrice += absPrice.charAt(i);
                }
    
                tempAbsPrice = tempAbsPrice.replace(/(\d{3})/g, "$1" + thousandSep);
                if (tempAbsPrice.slice(-thousandSep.length) == thousandSep) {
                    tempAbsPrice = tempAbsPrice.slice(0, -thousandSep.length);
                }
    
                absPrice = '';
                for (var i=tempAbsPrice.length-1; i>=0 ;i--) {
                    absPrice += tempAbsPrice.charAt(i);
                }
    
                if (typeof decimalPrice != 'undefined' && decimalPrice.length > 0) {
                    //if only one decimal digit add zero at end
                    if(decimalPrice.length == 1) {
                        decimalPrice += '0';
                    }
                    absPrice += decimalSep + decimalPrice;
                }
    
            }
    
            absPrice = priceFormatOpts.currency.replace('%d', absPrice.toString());
    
            return absPrice;
    
        }
        else if(price) {
            price = priceFormatOpts.priceFormat.replace('%d', price);
        }
    
        return price;
    
    }

    /**
	 * Adds a new custom image to the product stage. This method should be used if you are using an own image uploader for the product designer. The customImageParameters option will be applied on the images that are added via this method.
	 *
	 * @method addCustomImage
	 * @param {string} source The URL of the image.
	 * @param {string} title The title for the design.
	 * @param {Object} options Additional options.
	 * @param {number} [viewIndex] The index of the view where the element needs to be added to. If no index is set, it will be added to current showing view.


	 */
	addCustomImage(source, title, options={}, viewIndex) {

		viewIndex = viewIndex === undefined ? this.currentViewIndex : viewIndex;

		const image = new Image;
		image.crossOrigin = "anonymous";
    	image.src = source;

    	this.toggleSpinner(true, this.translator.getTranslation('misc', 'loading_image'));
        addElemClasses(
            this.viewsNav.container,
            ['fpd-disabled']
        );

		image.onload = () => {

			this.loadingCustomImage = false;

			let imageH = image.height,
				imageW = image.width,
				currentCustomImageParameters = this.currentViewInstance.options.customImageParameters;
                
			if(!checkImageDimensions(this, imageW, imageH)) {
				this.toggleSpinner(false);
    			return false;
			}

			let fixedParams = {
				isCustom: true,
			};

			//enable color wheel for svg and when no colors are set
			if(image.src.includes('.svg') && !currentCustomImageParameters.colors) {
				fixedParams.colors = true;
			}

            let imageParams = deepMerge(currentCustomImageParameters, fixedParams);
            imageParams = deepMerge(imageParams, options);

            this.viewInstances[viewIndex].fabricCanvas.addElement(
    			'image',
    			source,
    			title,
	    		imageParams,
	    		viewIndex
    		);
            
            removeElemClasses(
                this.viewsNav.container,
                ['fpd-disabled']
            );

		}

		image.onerror = () => {

            removeElemClasses(
                this.viewsNav.container,
                ['fpd-disabled']
            );

            Snackbar('Image could not be loaded!');
        }

	}
    
    _addGridItemToCanvas(item, additionalOpts={}, viewIndex, isRemoteImage=true) {
        
        if(!this.currentViewInstance) { return; }
        viewIndex = viewIndex === undefined ? this.currentViewIndex : viewIndex;
    
        const options = deepMerge(
            {_addToUZ: this.currentViewInstance.currentUploadZone},
            additionalOpts
        );
                
        this._addCanvasImage(
            item.dataset.source,
            item.dataset.title,
            options,
            viewIndex,
            isRemoteImage
        );
    }
    
    _addCanvasImage(source, title, options={}, viewIndex, isRemoteImage=true) {
        
        if(!this.currentViewInstance) return;
        viewIndex = viewIndex === undefined ? this.currentViewIndex : viewIndex;
                
        //download remote image to local server (FB, Instagram, Pixabay)        
        if(FancyProductDesigner.uploadsToServer && isRemoteImage) {
    
            this._downloadRemoteImage(
                source,
                title,
                options
            );
    
        }
        //add data uri or local image to canvas
        else {
    
            this.loadingCustomImage = true;
            this.addCustomImage(
                source,
                title ,
                options,
                viewIndex
            );
    
        }
    
    }

    _downloadRemoteImage(source, title, options={}) {

        if(!this.mainOptions.fileServerURL) {
            alert('You need to set the fileServerURL in the option, otherwise file uploading does not work!')
            return;
        }

		this.loadingCustomImage = true;
		this.toggleSpinner(true,  this.translator.getTranslation('misc', 'loading_image'));
        addElemClasses(
            this.viewsNav.container,
            ['fpd-disabled']
        );

        const formData = new FormData();
        formData.append('url', source);

        const _errorHandler = (errorMsg) => {

            removeElemClasses(
                this.viewsNav.container,
                ['fpd-disabled']
            );

            this.toggleSpinner(false);
            Snackbar(errorMsg);
        }

        postJSON({
            url: this.mainOptions.fileServerURL,
            body: formData,
            onSuccess: (data) => {
                
                if(data && data.image_src) {
                    
                    this.addCustomImage(
                        data.image_src,
                        data.filename ? data.filename : title,
                        options
                    );
    
                }
                else {

                    _errorHandler(data.error);
    
                }

                
            },
            onError: _errorHandler
        })

	}
    
    addCanvasDesign(source, title, params={}, viewIndex) {
        
        if(!this.currentViewInstance) { return; }
    
        this.toggleSpinner(true, this.translator.getTranslation('misc', 'loading_image'));
        
        params = deepMerge(this.currentViewInstance.options.customImageParameters, params);
        
        params.isCustom = true;
        if(this.currentViewInstance.currentUploadZone) {
            params._addToUZ = this.currentViewInstance.currentUploadZone;
        }
    
        this.currentViewInstance.fabricCanvas.addElement(
            'image', 
            source, 
            title, 
            params, 
            viewIndex
        );
    
    }

    /**
	 * Toggle the responsive behavior.
	 *
	 * @method toggleResponsive
	 * @param {Boolean} [toggle] True or false.
	 * @return {Boolean} Returns true or false.


	 */
	toggleResponsive(toggle) {

		toggle = toggle === undefined ? this.container.classList.contains('fpd-not-responsive') : toggle;

        toggleElemClasses(
            this.container,
            ['fpd-not-responsive'],
            !toggle
        )

        this.viewInstances.forEach((viewInst, viewIndex) => {

			viewInst.options.responsive = toggle;

			if(viewIndex == this.currentViewIndex) {
                viewInst.fabricCanvas.resetSize();
			}

		});

		return toggle;

	}

    /**
	 * Returns the current showing product with all views and elements in the views.
	 *
	 * @method getProduct
	 * @param {boolean} [onlyEditableElements=false] If true, only the editable elements will be returned.
	 * @param {boolean} [customizationRequired=false] To receive the product the user needs to customize the initial elements.
	 * @return {array} An array with all views. A view is an object containing the title, thumbnail, custom options and elements. An element object contains the title, source, parameters and type.


	 */
	getProduct(onlyEditableElements=false, customizationRequired=false) {

		let customizationChecker = false,
			jsMethod = this.mainOptions.customizationRequiredRule == 'all' ? 'every' : 'some';

        //todo check
		customizationChecker = this.viewInstances[jsMethod]((viewInst) => {
			return viewInst.isCustomized;
		})

		if(customizationRequired && !customizationChecker) {
			Snackbar(this.translator.getTranslation('misc', 'customization_required_info'));
			return false;
		}

		this.deselectElement();
		this.currentViewInstance.fabricCanvas.resetZoom();

		this.doUnsavedAlert = false;

		//check if an element is out of his containment
		let product = [];

        this.getElements().forEach((element) => {

			if(element.isOut && element.boundingBoxMode === 'inside' && !element.__editorMode) {

				Snackbar(
					element.title+': '+this.translator.getTranslation('misc', 'out_of_bounding_box')
				);

				product = false;
			}

		});

		//abort process
		if(product === false) {
			return false;
		}

		//add views
		for(var i=0; i < this.viewInstances.length; ++i) {

			let viewInstance = this.viewInstances[i],
				relevantViewOpts = viewInstance.options;

			let viewElements = viewInstance.fabricCanvas.getObjects(),
				jsonViewElements = [];

			for(var j=0; j < viewElements.length; ++j) {

				const element = viewElements[j];

				if(element.title !== undefined && element.source !== undefined) {

					var jsonItem = {
						title: element.title,
						source: element.source,
						parameters: element.getElementJSON(),
						type: element.getType()
					};

					if(relevantViewOpts.printingBox 
                        && relevantViewOpts.printingBox.hasOwnProperty('left')  
                        && relevantViewOpts.printingBox.hasOwnProperty('top')
                    ) {

						let pointLeftTop = element.getPointByOrigin('left', 'top');

						jsonItem.printingBoxCoords = {
							left: pointLeftTop.x - relevantViewOpts.printingBox.left,
							top: pointLeftTop.y - relevantViewOpts.printingBox.top,
						};

					}

					if(onlyEditableElements) {

						if(element.isEditable)
							jsonViewElements.push(jsonItem);

					}
					else {

						jsonViewElements.push(jsonItem);

					}
				}
			}

			const viewObj = {
				title: viewInstance.title,
				thumbnail: viewInstance.thumbnail,
				elements: jsonViewElements,
				options: relevantViewOpts,
				names_numbers: viewInstance.names_numbers,
				mask: viewInstance.mask,
				locked: viewInstance.locked
			};
            
			if(i == 0 && this.productViews[0].hasOwnProperty('productTitle')) {
				viewObj.productTitle = this.productViews[0].productTitle;
			}

			product.push(viewObj);

		}

		//returns an array with all views
		return product;

	}

    /**
	 * Creates all views in one data URL. The different views will be positioned below each other.
	 *
	 * @method getProductDataURL
	 * @param {Function} callback A function that will be called when the data URL is created. The function receives the data URL.
	 * @param {Object} [options] See {@link FancyProductDesignerView#toDataURL}.
	 * @param {Array} [viewRange=[]] An array defining the start and the end indexes of the exported views. When not defined, all views will be exported.
	 * @example fpd.getProductDataURL( function(dataURL){} );


	 */
	getProductDataURL(callback=() => {}, options={}, viewRange=[]) {

		options.onlyExportable = options.onlyExportable === undefined ? false : options.onlyExportable;
		options.enableRetinaScaling = options.enableRetinaScaling === undefined ? false : options.enableRetinaScaling;
        options.watermarkImg = this.watermarkImg;

		if(this.viewInstances.length === 0) { callback(''); return; }

        this.currentViewInstance.fabricCanvas.resetZoom();

        //create hidden canvas
        const hiddenCanvas = document.createElement('canvas');

		let tempDevicePixelRatio = fabric.devicePixelRatio,
			printCanvas = new fabric.Canvas(hiddenCanvas, {
				containerClass: 'fpd-hidden fpd-hidden-canvas',
				enableRetinaScaling: false
			}),
			viewCount = 0,
			multiplier = options.multiplier ? options.multiplier : 1,
			targetViews = viewRange.length == 2 ? this.viewInstances.slice(viewRange[0], viewRange[1]) : this.viewInstances;

		const _addCanvasImage = (viewInst) => {
            
			fabric.devicePixelRatio = 1;

			viewInst.toDataURL((dataURL) => {

				fabric.Image.fromURL(dataURL, (img) => {

					printCanvas.add(img);

					if(viewCount > 0) {
						img.set('top', printCanvas.getHeight());
						printCanvas.setDimensions({height: (printCanvas.getHeight() + (viewInst.options.stageHeight * multiplier))});
					}

					viewCount++;
					if(viewCount < targetViews.length) {
						_addCanvasImage(targetViews[viewCount]);
					}
					else {

						delete options['multiplier'];

						setTimeout(function() {

							callback(printCanvas.toDataURL(options));
							fabric.devicePixelRatio = tempDevicePixelRatio;
							printCanvas.dispose();

							if(this.currentViewInstance) {
								this.currentViewInstance.fabricCanvas.resetSize();
							}

						}, 100);

					}

				}, {crossOrigin: "anonymous"});

			}, options);

			if(viewInst.options.stageWidth * multiplier > printCanvas.getWidth()) {
				printCanvas.setDimensions({width: viewInst.options.stageWidth * multiplier});
			}

		};
        
		const firstView = targetViews[0];
		printCanvas.setDimensions({width: firstView.options.stageWidth * multiplier, height: firstView.options.stageHeight * multiplier});
		_addCanvasImage(firstView);

	}

    /**
	 * Gets the views as data URL.
	 *
	 * @method getViewsDataURL
	 * @param {Function} callback A function that will be called when the data URL is created. The function receives the data URL.
	 * @param {string} [options] See {@link FancyProductDesignerView#toDataURL}.
	 * @return {array} An array with all views as data URLs.


	 */
	getViewsDataURL(callback=() => {}, options={}) {

        options.watermarkImg = this.watermarkImg;

		let dataURLs = [];

		this.currentViewInstance.fabricCanvas.resetZoom();
		for(var i=0; i < this.viewInstances.length; ++i) {

			this.viewInstances[i].toDataURL((dataURL) => {

				dataURLs.push(dataURL);

				if(dataURLs.length === this.viewInstances.length) {
					callback(dataURLs);
				}

			}, options);

		}

	}

    /**
	 * Opens the current showing product in a Pop-up window and shows the print dialog.
	 *
	 * @method print


	 */
	print() {

		const _createPopupImage = (dataURLs) => {
            
			let images = [],
				imageLoop = 0;

			//load all images first
			for(var i=0; i < dataURLs.length; ++i) {

				let image = new Image();
				image.src = dataURLs[i];
				image.onload = () => {

					images.push(image);
					imageLoop++;

					//add images to popup and print popup
					if(imageLoop == dataURLs.length) {
                        
						const popup = window.open('','','width='+images[0].width+',height='+(images[0].height*dataURLs.length)+',location=no,menubar=no,scrollbars=yes,status=no,toolbar=no');
						popupBlockerAlert(popup, this.translator.getTranslation('misc', 'popup_blocker_alert'));

						popup.document.title = "Print Image";
						for(var j=0; j < images.length; ++j) {                            
							popup.document.body.append(images[j]);
						}

						setTimeout(() => {

							popup.print();

						}, 1000);

					}
				}

			}

		};

		this.getViewsDataURL(_createPopupImage);

	}

    /**
	 * Get all fonts used in the product.
	 *
	 * @method getUsedFonts
	 * @return {array} An array with objects containing the font name and optional the URL to the font.
	 */
	getUsedFonts() {        

		let _usedFonts = [], //temp to check if already included
			usedFonts = [];

		this.getElements(-1, 'all', false).forEach((element) => {

			if(element.getType() === 'text') {

				if(_usedFonts.indexOf(element.fontFamily) === -1) {

					var fontObj = {name: element.fontFamily},
                        result = this.mainOptions.fonts.find(e => e.name == element.fontFamily);

					//check if result contains props and url prop
					if(result) {

						if(result.url) {
							fontObj.url = result.url;
						}

						if(result.variants) {

							Object.keys(result.variants).forEach((key) => {

								var fontName = element.fontFamily;
								//bold
								if(key == 'n7') {
									fontName += ' Bold';
								}
								//italic
								else if(key == 'i4') {
									fontName += ' Italic';
								}
								//bold-italic
								else if(key == 'i7') {
									fontName += ' Bold Italic';
								}

								_usedFonts.push(fontName);
								usedFonts.push({name: fontName, url: result.variants[key]});

							});


						}

					}

					_usedFonts.push(element.fontFamily);
					usedFonts.push(fontObj);

				}

			}

		});

		return usedFonts;

	}

    /**
	 * Returns the views as SVG.
	 *
	 * @param {Object} options See {@link FancyProductDesignerView#toSVG}.
	 * @return {array} An array with all views as SVG.
	 */
	getViewsSVG (options) {

		let SVGs = [];

		for(var i=0; i < this.viewInstances.length; ++i) {
			SVGs.push(this.viewInstances[i].toSVG(options, this.getUsedFonts()));
		}

		return SVGs;

	}

    /**
	 * Get all used colors from a single or all views.
	 *
	 * @param {Number} [viewIndex=-1] The index of the target view. By default all views are target.
	 * @return {array} An array with hexdecimal color values.
	 */
	getUsedColors(viewIndex=-1) {

		var usedColors = [];
		this.getElements(viewIndex, 'all', false).forEach((element) => {

			const type = element.isColorizable();
            
			if(type) {

				if(type === 'svg') {

					if(element.type === 'group') {

						element.getObjects().forEach((path) => {

							if(tinycolor(path.fill).isValid()) {
								usedColors.push(path.fill);
							}

						});

					}
					else { //single path

						if(tinycolor(element.fill).isValid()) {
							usedColors.push(element.fill);
						}

					}

				}
				else {

					if(tinycolor(element.fill).isValid()) {
						usedColors.push(element.fill);
					}

				}
			}

		});

		return arrayUnique(usedColors);

	}

    /**
	 * Removes a view by index. If no viewIndex is set, it will remove the first view.
	 *
	 * @method removeView
	 * @param {Number} [viewIndex=0] The index of the target view.
	 */
	removeView(viewIndex=0) {

		const viewInst = this.viewInstances[viewIndex];
                
        viewInst.fabricCanvas.wrapperEl.remove();
        this.viewInstances.splice(viewIndex, 1);

		//select next view if removing view is showing
		if(this.viewInstances.length > 0) {
			viewIndex == this.currentViewIndex ? this.selectView(0) : this.selectView(viewIndex);
		}

		/**
		 * Gets fired when a view is removed.
		 *
		 * @event viewRemove
		 * @param {Event} event
		 */        
        this.dispatchEvent(
            new CustomEvent('viewRemove', {
                detail: {
                    viewIndex: viewIndex
                }
            })
        );

        //todo
        return;
		var truePrice = instance.calculatePrice();

		/**
	     * Gets fired as soon as the price changes in a view.
	     *
	     * @event priceChange
	     * @param {Event} event
	     * @param {number} elementPrice - The price of the element.
	     * @param {number} totalPrice - The true price of all views with quantity.
	     * @param {number} singleProductPrice - The true price of all views without quantity.
	     */
		$elem.trigger('priceChange', [null, truePrice, instance.singleProductPrice]);

	}
}

window.FancyProductDesigner = FancyProductDesigner;
window.FPDEmojisRegex = /(?:[\u261D\u26F9\u270A-\u270D]|\uD83C[\uDF85\uDFC2-\uDFC4\uDFC7\uDFCA-\uDFCC]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66-\uDC69\uDC6E\uDC70-\uDC78\uDC7C\uDC81-\uDC83\uDC85-\uDC87\uDCAA\uDD74\uDD75\uDD7A\uDD90\uDD95\uDD96\uDE45-\uDE47\uDE4B-\uDE4F\uDEA3\uDEB4-\uDEB6\uDEC0\uDECC]|\uD83E[\uDD18-\uDD1C\uDD1E\uDD1F\uDD26\uDD30-\uDD39\uDD3D\uDD3E\uDDD1-\uDDDD])(?:\uD83C[\uDFFB-\uDFFF])?|(?:[\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]|\uD83C[\uDC04\uDCCF\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF93\uDFA0-\uDFCA\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF4\uDFF8-\uDFFF]|\uD83D[\uDC00-\uDC3E\uDC40\uDC42-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDD7A\uDD95\uDD96\uDDA4\uDDFB-\uDE4F\uDE80-\uDEC5\uDECC\uDED0-\uDED2\uDEEB\uDEEC\uDEF4-\uDEF8]|\uD83E[\uDD10-\uDD3A\uDD3C-\uDD3E\uDD40-\uDD45\uDD47-\uDD4C\uDD50-\uDD6B\uDD80-\uDD97\uDDC0\uDDD0-\uDDE6])|(?:[#\*0-9\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u2660\u2663\u2665\u2666\u2668\u267B\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|\uD83C[\uDC04\uDCCF\uDD70\uDD71\uDD7E\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95\uDD96\uDDA4\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDEE0-\uDEE5\uDEE9\uDEEB\uDEEC\uDEF0\uDEF3-\uDEF8]|\uD83E[\uDD10-\uDD3A\uDD3C-\uDD3E\uDD40-\uDD45\uDD47-\uDD4C\uDD50-\uDD6B\uDD80-\uDD97\uDDC0\uDDD0-\uDDE6])\uFE0F/g;